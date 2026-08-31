-- 0116: monitor de qualidade do número central (fase 3 do híbrido)
--
-- No modelo híbrido, a nota de qualidade do número oficial é compartilhada por
-- TODAS as barbearias — se ela cair (denúncias), os lembretes da plataforma
-- inteira degradam antes de qualquer banimento. A Meta avisa por webhook
-- (campos phone_number_quality_update / account_update); o whatsapp-webhook
-- grava aqui e a auditoria transforma em alerta no canal que já existe.

create table if not exists public.eventos_da_waba (
  id uuid primary key default gen_random_uuid(),
  campo text not null,
  evento jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.eventos_da_waba enable row level security;
comment on table public.eventos_da_waba is
  'Eventos administrativos da WABA (qualidade do número, conta) vindos do webhook da Meta. RLS sem policy de propósito: só service_role.';

-- Ramo novo na auditoria: um alerta por evento (chave = id; auditoria_avisos
-- deduplica). salon_id nulo — é evento da plataforma, não de uma barbearia.
drop view if exists public.auditoria_pendente;
drop view if exists public.auditoria_operacao;

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
   and wc.updated_at < now() - interval '2 hours'
union all
select 'qualidade-waba:' || e.id,
       'Aviso da Meta sobre o numero central', 'grave', null::uuid, e.criado_em,
       'A Meta enviou ' || e.campo || ' para o numero que manda os lembretes de TODAS as barbearias. Detalhe: '
         || left(e.evento::text, 500)
         || '. Nota baixa degrada o alcance da plataforma inteira; conferir no WhatsApp Manager.'
  from public.eventos_da_waba e
 where e.criado_em > now() - interval '30 days';

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
