-- 0115: modelo híbrido — remetente oficial central (fase 1)
--
-- Decisão de 2026-08-30: conversa com cliente fica no número REAL da barbearia
-- (Evolution); lembrete/reativação/avisos saem de um número DA PLATAFORMA na
-- Cloud API. Motivo: sem BSP, registrar um número oficial por barbearia exige
-- login no Facebook e verificação de empresa de cada barbeiro — fricção que
-- mata o onboarding. E se a Meta banir, o número queimado é o nosso, não o do
-- barbeiro.
--
-- Esta fase: (1) a tabela de remetentes da plataforma, com override por salão
-- para fragmentação futura (nota de qualidade e tier são POR NÚMERO — quando
-- escalar, distribuímos as barbearias entre 2-3 números); (2) as views de
-- envio deixam de exigir conexão Cloud DO SALÃO — era o critério certo quando
-- cada barbearia tinha seu número, e vira bug no modelo central (barbearia
-- só-Evolution sumiria das filas em silêncio, o mesmo defeito que a 0085
-- documenta).

-- 1) Remetentes da plataforma
create table if not exists public.remetentes_oficiais (
  phone_number_id text primary key,
  rotulo text,
  waba_id text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.remetentes_oficiais enable row level security;
comment on table public.remetentes_oficiais is
  'Números da Cloud API DA PLATAFORMA que enviam templates por todas as barbearias. RLS sem policy de propósito: só service_role.';

-- Override por salão (null = usa o remetente ativo padrão)
alter table public.salons
  add column if not exists remetente_phone_number_id text
    references public.remetentes_oficiais(phone_number_id);

-- Semente: o número oficial que já existe na nossa WABA (hoje atado à
-- El Guardians em whatsapp_connections) passa a ser o remetente padrão.
insert into public.remetentes_oficiais (phone_number_id, waba_id, rotulo)
select wc.phone_number_id, wc.waba_id, 'principal'
  from public.whatsapp_connections wc
 where wc.provedor = 'cloud_api' and wc.phone_number_id is not null
 limit 1
on conflict (phone_number_id) do nothing;

-- 2) As views de envio trocam "conexão do salão" por "remetente da plataforma".
--    provedor fixa em 'cloud_api' e instance_name em null: notificação nunca
--    sai pela Evolution. Sem remetente ativo, a fila fica vazia (fail-closed).
--    drop antes de recriar: colunas mudam de origem (regra da casa, 42P16).

-- Dependentes de vencimentos_proximos caem junto e são recriadas no fim.
drop view if exists public.auditoria_pendente;
drop view if exists public.auditoria_operacao;
drop view if exists public.vencimentos_a_avisar;
drop view if exists public.clientes_para_reativar;
drop view if exists public.clientes_para_avisar_retorno;
drop view if exists public.atrasos_para_perguntar;
drop view if exists public.vencimentos_proximos;

create view public.clientes_para_reativar
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2,
         s.remetente_phone_number_id
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
), ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
), elegivel as (
  select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone,
         uv.em as visita,
         current_date - (uv.em at time zone 'America/Sao_Paulo')::date as dias,
         cfg.reativacao_dias, cfg.reativacao_dias_2,
         'cloud_api'::text as provedor, rem.phone_number_id, null::text as instance_name
    from config cfg
    join public.clients c on c.salon_id = cfg.salon_id
    join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
    join public.salons_com_automacao sa on sa.id = cfg.salon_id
    join lateral (
      select r.phone_number_id from public.remetentes_oficiais r
       where r.ativo
       order by (r.phone_number_id = cfg.remetente_phone_number_id) desc, r.criado_em
       limit 1
    ) rem on true
   where not c.recusou_contato and c.aviso_de_retorno_em is null
     and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
     and not exists (
       select 1 from public.appointments a2
        where a2.client_id = c.id and a2.status in ('agendado','confirmado')
          and a2.data_hora_inicio > now())
), com_etapa as (
  select e.*,
         case
           when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 2 and r.criado_em > e.visita) then 2
           when e.dias >= e.reativacao_dias
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 1 and r.criado_em > e.visita) then 1
           else null
         end as etapa
    from elegivel e
)
select ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
       ce.dias as dias_sem_vir, ce.etapa, ce.provedor, ce.phone_number_id, ce.instance_name,
       '55' || regexp_replace(ce.telefone, '\D', '', 'g') as destino,
       t.nome_meta as template, t.idioma as template_idioma,
       case when ce.etapa = 1
            then jsonb_build_array(split_part(ce.nome, ' ', 1), ce.barbearia)
            else jsonb_build_array(split_part(ce.nome, ' ', 1), public.tempo_sem_vir(ce.dias), ce.barbearia)
       end as template_parametros
  from com_etapa ce
  join public.whatsapp_templates t
    on t.chave = case when ce.etapa = 1 then 'reativacao_convite' else 'reativacao_tempo' end
   and t.status = 'aprovado' and t.ativo
 where ce.etapa is not null;

create view public.clientes_para_avisar_retorno
with (security_invoker = on) as
with config as (
  select s.id as salon_id, s.nome as barbearia, s.reativacao_dias, s.reativacao_dias_2,
         s.remetente_phone_number_id
    from public.salons s
   where s.ativo and s.reativacao_dias > 0
), ultima_visita as (
  select a.client_id, a.salon_id, max(a.data_hora_inicio) as em
    from public.appointments a
   where a.status = 'concluido'
   group by a.client_id, a.salon_id
), elegivel as (
  select c.id as client_id, cfg.salon_id, cfg.barbearia, c.nome, c.telefone,
         uv.em as visita,
         current_date - (uv.em at time zone 'America/Sao_Paulo')::date as dias,
         cfg.reativacao_dias, cfg.reativacao_dias_2,
         'cloud_api'::text as provedor, rem.phone_number_id, null::text as instance_name
    from config cfg
    join public.clients c on c.salon_id = cfg.salon_id
    join ultima_visita uv on uv.client_id = c.id and uv.salon_id = cfg.salon_id
    join public.salons_com_automacao sa on sa.id = cfg.salon_id
    join lateral (
      select r.phone_number_id from public.remetentes_oficiais r
       where r.ativo
       order by (r.phone_number_id = cfg.remetente_phone_number_id) desc, r.criado_em
       limit 1
    ) rem on true
   where c.quer_aviso_de_retorno and c.aviso_de_retorno_em is not null
     and not c.recusou_contato
     and length('55' || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 12
     and not exists (
       select 1 from public.appointments a2
        where a2.client_id = c.id and a2.status in ('agendado','confirmado')
          and a2.data_hora_inicio > now())
), com_etapa as (
  select e.*,
         case
           when e.reativacao_dias_2 > 0 and e.dias >= e.reativacao_dias_2
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 2 and r.criado_em > e.visita) then 2
           when e.dias >= e.reativacao_dias
                and not exists (select 1 from public.reativacao_envios r
                                 where r.client_id = e.client_id and r.etapa = 1 and r.criado_em > e.visita) then 1
           else null
         end as etapa
    from elegivel e
)
select ce.client_id, ce.salon_id, ce.barbearia, ce.nome as cliente,
       ce.dias as dias_sem_vir, ce.etapa, ce.provedor, ce.phone_number_id, ce.instance_name,
       '55' || regexp_replace(ce.telefone, '\D', '', 'g') as destino,
       t.nome_meta as template, t.idioma as template_idioma,
       case when ce.etapa = 1
            then jsonb_build_array(split_part(ce.nome, ' ', 1), ce.barbearia, public.tempo_sem_vir(ce.dias))
            else jsonb_build_array(split_part(ce.nome, ' ', 1), public.tempo_sem_vir(ce.dias), ce.barbearia)
       end as template_parametros
  from com_etapa ce
  join public.whatsapp_templates t
    on t.chave = case when ce.etapa = 1 then 'retorno_pedido' else 'retorno_pedido_segunda' end
   and t.status = 'aprovado' and t.ativo
 where ce.etapa is not null;

create view public.atrasos_para_perguntar
with (security_invoker = on) as
with conversa as (
  select c_1.id as client_id, w.contact_phone, w.agent_paused
    from public.clients c_1
    join public.whatsapp_conversations w
      on w.salon_id = c_1.salon_id
     and right(regexp_replace(w.contact_phone, '\D', '', 'g'), 8) = c_1.telefone_norm
)
select a.id as appointment_id, a.salon_id, s.nome as barbearia, c.nome as cliente,
       'cloud_api'::text as provedor, rem.phone_number_id, null::text as instance_name,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_marcada,
       floor(extract(epoch from now() - a.data_hora_inicio) / 60)::integer as minutos_de_atraso,
       coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'),
                '55' || regexp_replace(c.telefone, '\D', '', 'g')) as destino,
       t.nome_meta as template, t.idioma as template_idioma,
       jsonb_build_array(split_part(c.nome, ' ', 1), s.nome,
                         to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI')) as template_parametros,
       'Oi, ' || split_part(c.nome, ' ', 1) || '! Aqui e da *' || s.nome || '*.' || chr(10) || chr(10)
         || 'Seu horario era ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI')
         || ' e a cadeira esta te esperando. Consegue chegar nos proximos minutos?' as texto
  from public.appointments a
  join public.salons s on s.id = a.salon_id
  join public.clients c on c.id = a.client_id
  join public.salons_com_automacao sa on sa.id = a.salon_id
  join lateral (
    select r.phone_number_id from public.remetentes_oficiais r
     where r.ativo
     order by (r.phone_number_id = s.remetente_phone_number_id) desc, r.criado_em
     limit 1
  ) rem on true
  join public.whatsapp_templates t
    on t.chave = 'atraso_esta_vindo' and t.status = 'aprovado' and t.ativo
  left join conversa conv on conv.client_id = c.id
 where a.status in ('agendado','confirmado')
   and a.chegou_em is null and a.iniciado_em is null and a.atraso_perguntado_em is null
   and coalesce(conv.agent_paused, false) = false
   and now() >= a.data_hora_inicio + make_interval(mins => s.atraso_tolerado_minutos)
   and now() < a.data_hora_inicio + interval '1 hour'
   and length(coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'),
                       '55' || regexp_replace(c.telefone, '\D', '', 'g'))) >= 12;

create view public.vencimentos_proximos
with (security_invoker = on) as
select s.id as salon_id, s.nome as salao, sub.acesso_ate,
       sub.acesso_ate - current_date as dias_restantes,
       -- LEFT lateral de propósito: a auditoria "vencimento sem canal" alerta
       -- quando provedor é nulo — some a linha e o alerta morre junto.
       case when rem.phone_number_id is not null then 'cloud_api' end as provedor,
       rem.phone_number_id, null::text as instance_name,
       '55' || regexp_replace(coalesce((
         select p.telefone
           from public.professionals p
           join public.user_salons us on us.user_id = p.user_id and us.salon_id = s.id
          where p.salon_id = s.id and us.role = 'owner' and p.telefone is not null
          limit 1), s.telefone), '\D', '', 'g') as destino,
       'vencimento:' || s.id || ':' || to_char(sub.acesso_ate, 'YYYY-MM-DD') || ':' || (sub.acesso_ate - current_date) as chave,
       case sub.acesso_ate - current_date
         when 3 then 'Oi! Passando pra avisar que o teste gratis do Club Cut na *' || s.nome
                     || '* acaba em 3 dias, no dia ' || to_char(sub.acesso_ate, 'DD/MM') || '.'
                     || chr(10) || chr(10)
                     || 'Pra continuar com a agenda e o atendimento automatico no WhatsApp, e so assinar dentro do sistema, em Assinatura.'
         else 'Oi! O teste gratis do Club Cut na *' || s.nome || '* acaba hoje.' || chr(10) || chr(10)
              || 'O acesso ao sistema bloqueia amanha, mas o atendimento automatico no WhatsApp continua por mais 3 dias. Se quiser seguir, e so assinar em Assinatura.'
       end as texto
  from public.salons s
  join public.subscriptions sub on sub.salon_id = s.id
  left join lateral (
    select r.phone_number_id from public.remetentes_oficiais r
     where r.ativo
     order by (r.phone_number_id = s.remetente_phone_number_id) desc, r.criado_em
     limit 1
  ) rem on true
 where s.ativo and sub.status = 'trial' and sub.acesso_ate is not null
   and (sub.acesso_ate - current_date) in (0, 3);

-- 3) Recriação das dependentes, idênticas ao que estava em produção
create view public.vencimentos_a_avisar
with (security_invoker = on) as
select v.salon_id, v.salao, v.acesso_ate, v.dias_restantes,
       v.provedor, v.phone_number_id, v.instance_name, v.destino, v.chave,
       t.nome_meta as template, t.idioma as template_idioma,
       jsonb_build_array(v.salao,
         case v.dias_restantes
           when 0 then 'hoje'
           else 'em ' || v.dias_restantes || ' dias, no dia ' || to_char(v.acesso_ate, 'DD/MM')
         end) as template_parametros,
       v.texto
  from public.vencimentos_proximos v
  join public.whatsapp_templates t
    on t.chave = 'fim_de_teste' and t.status = 'aprovado' and t.ativo
  left join public.auditoria_avisos a on a.chave = v.chave
 where a.chave is null and v.provedor is not null and length(v.destino) >= 12;

create view public.auditoria_operacao
with (security_invoker = on) as
select 'trial-no-teto:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD') as chave,
       'Teste gratis atingiu o teto de uso' as tipo, 'aviso' as gravidade,
       s.id as salon_id, now() as ocorrido_em,
       s.nome || ' -- ' || u.recebidas_no_total || ' mensagens no teste, ' || u.recebidas_hoje
         || ' hoje. O agente parou de responder.' as detalhe
  from public.salons s
  join public.subscriptions sub on sub.salon_id = s.id
  join public.uso_do_agente u on u.salon_id = s.id
 where s.ativo and sub.status = 'trial'
   and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)
union all
select 'whatsapp-caiu:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'WhatsApp desconectado', 'grave', s.id, now(),
       case ca.provedor
         when 'cloud_api' then s.nome || ' -- o numero nao esta registrado na Cloud API. Nenhum cliente esta sendo atendido.'
         else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde '
              || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
              || '. Nenhum cliente esta sendo atendido.'
       end
  from public.salons s
  join public.conexoes_ativas ca on ca.salon_id = s.id
  join public.whatsapp_connections wc on wc.salon_id = s.id
 where s.ativo and not ca.conectado
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and exists (select 1 from public.whatsapp_messages m
                join public.whatsapp_conversations c on c.id = m.conversation_id
               where c.salon_id = s.id)
union all
select 'vencimento-sem-canal:' || v.salon_id || ':' || to_char(v.acesso_ate, 'YYYY-MM-DD'),
       'Teste vencendo e sem como avisar', 'aviso', v.salon_id, now(),
       v.salao || ' -- o teste acaba '
         || case v.dias_restantes when 0 then 'hoje' else 'em ' || v.dias_restantes || ' dias' end
         || ' e nao ha como avisar automaticamente ('
         || case when v.provedor is null then 'WhatsApp desconectado' else 'sem telefone cadastrado' end
         || '). Fale com o dono.'
  from public.vencimentos_proximos v
 where v.provedor is null or length(v.destino) < 12
union all
select 'dia-sem-barbeiro:' || s.id || ':' || dia.chave || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'Barbearia abre num dia sem barbeiro', 'grave', s.id, now(),
       s.nome || ' -- abre ' || dia.nome
         || ' mas nenhum barbeiro tem jornada nesse dia. Ninguem consegue agendar, nem pelo WhatsApp nem pelo QR.'
  from public.salons s
  cross join (values (0,'dom','domingo'),(1,'seg','segunda'),(2,'ter','terca'),(3,'qua','quarta'),
                     (4,'qui','quinta'),(5,'sex','sexta'),(6,'sab','sabado')) dia(numero, chave, nome)
 where s.ativo
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and (s.horario_funcionamento -> dia.chave) ? 'abre'
   and not exists (select 1 from public.professional_schedules ps
                    join public.professionals p on p.id = ps.professional_id
                   where p.salon_id = s.id and p.ativo and ps.ativo and ps.dia_semana = dia.numero)
   and exists (select 1 from public.professionals p where p.salon_id = s.id and p.ativo)
union all
select 'whatsapp-nunca-conectou:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
       'WhatsApp nunca terminou de conectar', 'grave', s.id, now(),
       case ca.provedor
         when 'cloud_api' then s.nome || ' -- o numero foi cadastrado mas nunca ficou registrado na Cloud API, e essa barbearia NUNCA recebeu uma mensagem. O agente nao funciona para ela, e o dono nao tem como saber.'
         else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde '
              || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
              || ' e essa barbearia NUNCA recebeu uma mensagem. Provavelmente o QR nunca foi lido ate o fim. O agente nao funciona para ela, e o dono nao tem como saber.'
       end
  from public.salons s
  join public.conexoes_ativas ca on ca.salon_id = s.id
  join public.whatsapp_connections wc on wc.salon_id = s.id
 where s.ativo and not ca.conectado
   and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
   and not exists (select 1 from public.whatsapp_messages m
                    join public.whatsapp_conversations c on c.id = m.conversation_id
                   where c.salon_id = s.id)
   and wc.updated_at < now() - interval '2 hours';

create view public.auditoria_pendente
with (security_invoker = on) as
select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
  from (
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_do_agente
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_fronteira
    union all
    select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_operacao
  ) a
  left join public.auditoria_avisos av on av.chave = a.chave
 where av.chave is null
 order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
          a.ocorrido_em desc;
