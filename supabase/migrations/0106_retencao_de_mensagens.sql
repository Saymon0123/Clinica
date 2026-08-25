-- Retencao do historico do WhatsApp (2026-08-25).
--
-- `whatsapp_messages` e a unica tabela que cresce de verdade: cada atendimento
-- do agente gera dezenas de linhas. Mensagem com mais de 12 meses nao serve a
-- nada operacional -- o resumo do cliente vive em `resumo_contexto`, e
-- agendamentos e financeiro tem tabelas proprias. A poda roda todo dia 2 as
-- 04h30 de Brasilia (07:30 UTC), fora do horario dos outros crons.
--
-- Mesmo criterio para os logs auxiliares: `auditoria_avisos` (rastro dos
-- lembretes) e `asaas_eventos` (idempotencia do webhook -- evento de um
-- pagamento de um ano atras nunca mais chega repetido).
--
-- O que NUNCA entra aqui: appointments, orders, commissions, faturas_de_uso --
-- historico do negocio e defesa de cobranca.

create or replace function public.poda_historico_antigo()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  v_qtd integer;
begin
  delete from public.whatsapp_messages where created_at < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  -- Seguro apagar: a chave deduplica lembretes, e lembrete so olha o dia
  -- corrente -- aviso de um ano atras nunca mais e consultado.
  delete from public.auditoria_avisos where avisado_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  delete from public.asaas_eventos where recebido_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count;
  v_total := v_total + v_qtd;

  return v_total;
end;
$$;

revoke execute on function public.poda_historico_antigo() from public, anon, authenticated;

select cron.schedule(
  'poda-historico-antigo',
  '30 7 2 * *',
  $$select public.poda_historico_antigo()$$
);
