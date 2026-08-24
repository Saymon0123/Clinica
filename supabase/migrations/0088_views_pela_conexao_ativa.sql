-- As views deixam de perguntar `status = 'open'` -- vocabulario da Evolution.
--
-- `status` so significa alguma coisa na Evolution, onde ha sessao de celular
-- pareado que cai. Na Cloud API nao existe sessao: ou o numero esta registrado,
-- ou nao esta. Uma barbearia migrada ficava com o status congelado no ultimo
-- valor da Evolution e desaparecia destas views em silencio -- foi o que
-- aconteceu com a El Guardians, que sumiu de quatro automacoes sem nenhum erro
-- em lugar nenhum.
--
-- Agora todas passam por `conexoes_ativas`, que sabe o que "conectado" quer
-- dizer em cada provedor, e as views nao precisam saber.
--
-- **Cada uma expoe os tres identificadores:** `provedor`, `phone_number_id` e
-- `instance_name`. Os fluxos do n8n ainda mandam pela Evolution e usam o
-- `instance_name`; quando forem migrados, o que precisam ja esta aqui.
--
-- **Duas regras da auditoria estavam invertidas para a Cloud API.** Elas
-- disparavam com `status is distinct from 'open'` -- e como uma barbearia na
-- Cloud API nunca tem status 'open', as duas iriam alertar "WhatsApp
-- desconectado" e "nunca terminou de conectar" para toda barbearia migrada e
-- funcionando. Alerta que grita sem motivo e pior que alerta nenhum: ensina a
-- ignorar.
--
-- `drop` antes de `create`: acrescentar coluna no meio da lista de um
-- `create or replace view` levanta 42P16.

drop view if exists public.auditoria_pendente;
drop view if exists public.auditoria_operacao;
drop view if exists public.vencimentos_a_avisar;
drop view if exists public.vencimentos_proximos;
drop view if exists public.atrasos_para_perguntar;

create view public.atrasos_para_perguntar
with (security_invoker = on) as
 with conversa as (
   select c_1.id as client_id, w.contact_phone, w.agent_paused
     from clients c_1
     join whatsapp_conversations w
       on w.salon_id = c_1.salon_id
      and right(regexp_replace(w.contact_phone, '\D', '', 'g'), 8) = c_1.telefone_norm
 )
 select a.id as appointment_id,
    a.salon_id,
    s.nome as barbearia,
    c.nome as cliente,
    ca.provedor,
    ca.phone_number_id,
    ca.instance_name,
    to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI') as hora_marcada,
    (floor((extract(epoch from (now() - a.data_hora_inicio)) / 60)))::integer as minutos_de_atraso,
    coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'), ('55' || regexp_replace(c.telefone, '\D', '', 'g'))) as destino,
    'Oi, ' || split_part(c.nome, ' ', 1) || '! Aqui e da *' || s.nome || '*.' || chr(10) || chr(10)
      || 'Seu horario era ' || to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI')
      || ' e a cadeira esta te esperando. Consegue chegar nos proximos minutos?' as texto
   from appointments a
     join salons s on s.id = a.salon_id
     join clients c on c.id = a.client_id
     join salons_com_automacao sa on sa.id = a.salon_id
     join public.conexoes_ativas ca on ca.salon_id = a.salon_id and ca.conectado
     left join conversa conv on conv.client_id = c.id
  where a.status = any (array['agendado', 'confirmado'])
    and a.chegou_em is null
    and a.iniciado_em is null
    and a.atraso_perguntado_em is null
    and coalesce(conv.agent_paused, false) = false
    and now() >= (a.data_hora_inicio + make_interval(mins => s.atraso_tolerado_minutos))
    and now() < (a.data_hora_inicio + '01:00:00'::interval)
    and length(coalesce(regexp_replace(conv.contact_phone, '\D', '', 'g'), ('55' || regexp_replace(c.telefone, '\D', '', 'g')))) >= 12;

create view public.vencimentos_proximos
with (security_invoker = on) as
 select s.id as salon_id,
    s.nome as salao,
    sub.acesso_ate,
    (sub.acesso_ate - current_date) as dias_restantes,
    ca.provedor,
    ca.phone_number_id,
    ca.instance_name,
    ('55' || regexp_replace(coalesce(( select p.telefone
           from professionals p
             join user_salons us on us.user_id = p.user_id and us.salon_id = s.id
          where p.salon_id = s.id and us.role = 'owner' and p.telefone is not null
         limit 1), s.telefone), '\D', '', 'g')) as destino,
    ('vencimento:' || s.id || ':' || to_char((sub.acesso_ate)::timestamptz, 'YYYY-MM-DD') || ':' || (sub.acesso_ate - current_date)) as chave,
        case (sub.acesso_ate - current_date)
            when 3 then 'Oi! Passando pra avisar que o teste gratis do Club Cut na *' || s.nome || '* acaba em 3 dias, no dia ' || to_char((sub.acesso_ate)::timestamptz, 'DD/MM') || '.' || chr(10) || chr(10) || 'Pra continuar com a agenda e o atendimento automatico no WhatsApp, e so assinar dentro do sistema, em Assinatura.'
            else 'Oi! O teste gratis do Club Cut na *' || s.nome || '* acaba hoje.' || chr(10) || chr(10) || 'O acesso ao sistema bloqueia amanha, mas o atendimento automatico no WhatsApp continua por mais 3 dias. Se quiser seguir, e so assinar em Assinatura.'
        end as texto
   from salons s
     join subscriptions sub on sub.salon_id = s.id
     left join public.conexoes_ativas ca on ca.salon_id = s.id and ca.conectado
  where s.ativo and sub.status = 'trial' and sub.acesso_ate is not null
    and (sub.acesso_ate - current_date) = any (array[0, 3]);

create view public.vencimentos_a_avisar
with (security_invoker = on) as
 select v.salon_id, v.salao, v.acesso_ate, v.dias_restantes,
        v.provedor, v.phone_number_id, v.instance_name,
        v.destino, v.chave, v.texto
   from vencimentos_proximos v
     left join auditoria_avisos a on a.chave = v.chave
  where a.chave is null
    -- `provedor` nulo significa que o left join nao achou conexao ativa. Antes
    -- isto era `instance_name is not null`, que na Cloud API e sempre nulo --
    -- e o aviso de vencimento nunca sairia para uma barbearia migrada.
    and v.provedor is not null
    and length(v.destino) >= 12;

create view public.auditoria_operacao
with (security_invoker = on) as
 select ('trial-no-teto:' || s.id || ':' || to_char((current_date)::timestamptz, 'YYYY-MM-DD')) as chave,
    'Teste gratis atingiu o teto de uso' as tipo,
    'aviso' as gravidade,
    s.id as salon_id,
    now() as ocorrido_em,
    (s.nome || ' -- ' || u.recebidas_no_total || ' mensagens no teste, ' || u.recebidas_hoje || ' hoje. O agente parou de responder.') as detalhe
   from salons s
     join subscriptions sub on sub.salon_id = s.id
     join uso_do_agente u on u.salon_id = s.id
  where s.ativo and sub.status = 'trial' and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)
union all
 -- Conectado ou nao vem de `conexoes_ativas`; o texto e que muda por provedor,
 -- porque "esta close desde 14/08" nao quer dizer nada para quem esta na Cloud
 -- API, e "o QR nunca foi lido" e conselho de um mundo que ela nao habita.
 select ('whatsapp-caiu:' || s.id || ':' || to_char((current_date)::timestamptz, 'YYYY-MM-DD')) as chave,
    'WhatsApp desconectado' as tipo,
    'grave' as gravidade,
    s.id as salon_id,
    now() as ocorrido_em,
    case ca.provedor
      when 'cloud_api' then s.nome || ' -- o numero nao esta registrado na Cloud API. Nenhum cliente esta sendo atendido.'
      else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde ' || to_char((wc.updated_at at time zone 'America/Sao_Paulo'), 'DD/MM HH24:MI') || '. Nenhum cliente esta sendo atendido.'
    end as detalhe
   from salons s
     join public.conexoes_ativas ca on ca.salon_id = s.id
     join whatsapp_connections wc on wc.salon_id = s.id
  where s.ativo and not ca.conectado
    and exists (select 1 from salons_atendendo sa where sa.id = s.id)
    and exists (select 1 from whatsapp_messages m join whatsapp_conversations c on c.id = m.conversation_id where c.salon_id = s.id)
union all
 select ('vencimento-sem-canal:' || v.salon_id || ':' || to_char((v.acesso_ate)::timestamptz, 'YYYY-MM-DD')) as chave,
    'Teste vencendo e sem como avisar' as tipo,
    'aviso' as gravidade,
    v.salon_id,
    now() as ocorrido_em,
    (v.salao || ' -- o teste acaba ' ||
        case v.dias_restantes when 0 then 'hoje' else ('em ' || v.dias_restantes || ' dias') end
        || ' e nao ha como avisar automaticamente (' ||
        case when v.provedor is null then 'WhatsApp desconectado' else 'sem telefone cadastrado' end
        || '). Fale com o dono.') as detalhe
   from vencimentos_proximos v
  where v.provedor is null or length(v.destino) < 12
union all
 select ('dia-sem-barbeiro:' || s.id || ':' || dia.chave || ':' || to_char((current_date)::timestamptz, 'YYYY-MM-DD')) as chave,
    'Barbearia abre num dia sem barbeiro' as tipo,
    'grave' as gravidade,
    s.id as salon_id,
    now() as ocorrido_em,
    (s.nome || ' -- abre ' || dia.nome || ' mas nenhum barbeiro tem jornada nesse dia. Ninguem consegue agendar, nem pelo WhatsApp nem pelo QR.') as detalhe
   from salons s
     cross join ( values (0,'dom','domingo'), (1,'seg','segunda'), (2,'ter','terca'), (3,'qua','quarta'), (4,'qui','quinta'), (5,'sex','sexta'), (6,'sab','sabado')) dia(numero, chave, nome)
  where s.ativo
    and exists (select 1 from salons_atendendo sa where sa.id = s.id)
    and (s.horario_funcionamento -> dia.chave) ? 'abre'
    and not exists (select 1 from professional_schedules ps join professionals p on p.id = ps.professional_id where p.salon_id = s.id and p.ativo and ps.ativo and ps.dia_semana = dia.numero)
    and exists (select 1 from professionals p where p.salon_id = s.id and p.ativo)
union all
 select ('whatsapp-nunca-conectou:' || s.id || ':' || to_char((current_date)::timestamptz, 'YYYY-MM-DD')) as chave,
    'WhatsApp nunca terminou de conectar' as tipo,
    'grave' as gravidade,
    s.id as salon_id,
    now() as ocorrido_em,
    case ca.provedor
      when 'cloud_api' then s.nome || ' -- o numero foi cadastrado mas nunca ficou registrado na Cloud API, e essa barbearia NUNCA recebeu uma mensagem. O agente nao funciona para ela, e o dono nao tem como saber.'
      else s.nome || ' -- o WhatsApp esta ' || coalesce(wc.status, 'sem conexao') || ' desde ' || to_char((wc.updated_at at time zone 'America/Sao_Paulo'), 'DD/MM HH24:MI') || ' e essa barbearia NUNCA recebeu uma mensagem. Provavelmente o QR nunca foi lido ate o fim. O agente nao funciona para ela, e o dono nao tem como saber.'
    end as detalhe
   from salons s
     join public.conexoes_ativas ca on ca.salon_id = s.id
     join whatsapp_connections wc on wc.salon_id = s.id
  where s.ativo and not ca.conectado
    and exists (select 1 from salons_atendendo sa where sa.id = s.id)
    and not exists (select 1 from whatsapp_messages m join whatsapp_conversations c on c.id = m.conversation_id where c.salon_id = s.id)
    and wc.updated_at < (now() - '02:00:00'::interval);

create view public.auditoria_pendente
with (security_invoker = on) as
 select a.chave, a.tipo, a.gravidade, a.salon_id, a.ocorrido_em, a.detalhe
   from ( select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_do_agente
        union all
          select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_fronteira
        union all
          select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from auditoria_operacao) a
     left join auditoria_avisos av on av.chave = a.chave
  where av.chave is null
  order by case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end, a.ocorrido_em desc;

comment on view public.atrasos_para_perguntar is
  'Agendamentos atrasados que ainda cabe perguntar. Conexao vem de conexoes_ativas, que sabe o que "conectado" significa em cada provedor -- perguntar status = open aqui fazia barbearia na Cloud API sumir em silencio.';
comment on view public.vencimentos_proximos is
  'Barbearias com teste vencendo em 3 dias ou hoje. Left join na conexao: a barbearia aparece mesmo sem WhatsApp ativo, e quem filtra e vencimentos_a_avisar.';
comment on view public.vencimentos_a_avisar is
  'O que de fato deve ser avisado: vencimento proximo, ainda nao avisado (auditoria_avisos), com conexao ativa e telefone plausivel.';
comment on view public.auditoria_operacao is
  'Alertas de operacao para o dono do SaaS. As regras de WhatsApp perguntam conexoes_ativas.conectado, nao status = open: a segunda alertaria "desconectado" para toda barbearia na Cloud API funcionando normalmente, e alerta que grita sem motivo ensina a ignorar.';

revoke all on public.atrasos_para_perguntar from anon;
revoke all on public.vencimentos_proximos from anon;
revoke all on public.vencimentos_a_avisar from anon;
revoke all on public.auditoria_operacao from anon;
revoke all on public.auditoria_pendente from anon;
grant select on public.atrasos_para_perguntar to authenticated, service_role;
grant select on public.vencimentos_proximos to authenticated, service_role;
grant select on public.vencimentos_a_avisar to authenticated, service_role;
grant select on public.auditoria_operacao to authenticated, service_role;
grant select on public.auditoria_pendente to authenticated, service_role;
