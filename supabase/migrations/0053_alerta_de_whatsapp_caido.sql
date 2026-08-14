-- Alerta de WhatsApp caído.
--
-- Sem isto, uma barbearia com o WhatsApp fora do ar só é descoberta quando o
-- dono reclama — e ele só reclama depois de perder cliente. Com um cliente isso
-- é tolerável; com dez é irresponsável.
--
-- **Não precisou de fluxo novo no n8n.** A auditoria já roda a cada 30 minutos
-- lendo `auditoria_pendente` e mandando um resumo no WhatsApp, com trava de
-- avisar uma vez só. Bastou a regra em SQL, e ela entra por `auditoria_operacao`
-- junto com o teto de uso do trial.
--
-- **Limite conhecido:** o aviso sai pela própria Evolution API. Se o servidor
-- inteiro cair, a regra detecta e a mensagem não tem como ser entregue — o
-- alarme depende da coisa que ele vigia. Para esse caso é preciso um
-- monitorador externo, fora desta infraestrutura.

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

-- 2. WhatsApp caiu numa barbearia que estava funcionando.
--
-- A condição que separa incidente de estado esperado é a existência de
-- mensagens: em 2026-08-14, quatro das cinco barbearias estavam com status
-- 'close' porque **nunca conectaram** — isso é item do checklist de ativação,
-- não alarme. Só vira incidente quando o WhatsApp já trocou mensagem e depois
-- parou.
--
-- Sem essa distinção o relatório mandaria o mesmo aviso todo dia para toda
-- barbearia nova, e alarme que sempre toca a pessoa aprende a ignorar.
--
-- Limitado a quem está dentro do prazo de atendimento: avisar que o WhatsApp de
-- um inadimplente está fora seria descrever o funcionamento normal.
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
  );

comment on view public.auditoria_operacao is
  'Achados operacionais, nao de comportamento do agente: teto de uso no trial e WhatsApp caido. Alimenta auditoria_pendente.';
