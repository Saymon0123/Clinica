-- Terceira regra operacional: vence e **não há como avisar**.
--
-- O fluxo da `0055` só alcança quem tem telefone e WhatsApp conectado. Sem esta
-- regra, o resto vencia em silêncio — que é exatamente o vazamento que o aviso
-- veio tapar, só que invisível.
--
-- Em 2026-08-14, **quatro das cinco barbearias não tinham telefone nenhum**:
-- nem do salão, nem do dono. O cadastro aberto passou a pedir no mesmo dia, mas
-- o legado continua sem, e barbearia cadastrada pelo wizard também pode ficar.

create or replace view public.auditoria_operacao
with (security_invoker = on) as

-- 1. Teste grátis atingiu o teto de uso (migration 0052).
select
  'trial-no-teto:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD') as chave,
  'Teste gratis atingiu o teto de uso' as tipo,
  'aviso' as gravidade,
  s.id as salon_id,
  now() as ocorrido_em,
  s.nome || ' -- ' || u.recebidas_no_total || ' mensagens no teste, ' ||
    u.recebidas_hoje || ' hoje. O agente parou de responder.' as detalhe
from public.salons s
join public.subscriptions sub on sub.salon_id = s.id
join public.uso_do_agente u on u.salon_id = s.id
where s.ativo
  and sub.status = 'trial'
  and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)

union all

-- 2. WhatsApp caiu numa barbearia que estava funcionando (migration 0053).
select
  'whatsapp-caiu:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
  'WhatsApp desconectado',
  'grave',
  s.id,
  now(),
  s.nome || ' -- o WhatsApp esta ' ||
    coalesce(wc.status, 'sem conexao') ||
    ' desde ' || to_char(wc.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
    '. Nenhum cliente esta sendo atendido.'
from public.salons s
join public.whatsapp_connections wc on wc.salon_id = s.id
where s.ativo
  and wc.status is distinct from 'open'
  and exists (select 1 from public.salons_atendendo sa where sa.id = s.id)
  and exists (
    select 1
    from public.whatsapp_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where c.salon_id = s.id
  )

union all

-- 3. Vence e não há como avisar.
select
  'vencimento-sem-canal:' || v.salon_id || ':' || to_char(v.acesso_ate, 'YYYY-MM-DD'),
  'Teste vencendo e sem como avisar',
  'aviso',
  v.salon_id,
  now(),
  v.salao || ' -- o teste acaba ' ||
    case v.dias_restantes when 0 then 'hoje' else 'em ' || v.dias_restantes || ' dias' end ||
    ' e nao ha como avisar automaticamente (' ||
    case
      when v.instance_name is null then 'WhatsApp desconectado'
      else 'sem telefone cadastrado'
    end || '). Fale com o dono.'
from public.vencimentos_proximos v
where v.instance_name is null or length(v.destino) < 12;

comment on view public.auditoria_operacao is
  'Achados operacionais: teto de uso no trial, WhatsApp caido e vencimento sem canal de aviso. Alimenta auditoria_pendente.';
