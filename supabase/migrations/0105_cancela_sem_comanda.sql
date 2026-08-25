-- Agendamento sem comanda fechada cancela sozinho (2026-08-25).
--
-- A faixa do balcao (chegou / nao veio) saiu do CRM: a decisao de presenca
-- deixou de ser um toque do barbeiro -- a ideia e ele usar MENOS o celular.
-- Quem fecha o ciclo agora e o banco:
--
--   servico termina (data_hora_fim) -> 15 minutos de tolerancia -> a comanda
--   nao fechou (o fechamento marca 'concluido') -> o agendamento vira
--   'cancelado' e a cadeira volta a ser vendavel pelo agente.
--
-- Auto-correcao embutida: se o barbeiro so estava atrasado e fechar a comanda
-- depois, o fechamento grava 'concluido' por cima do 'cancelado', e o trigger
-- carimba_cancelamento limpa o cancelado_em -- a metrica nao fica suja.
--
-- A cobranca por uso nao muda: agendamento criado pelo agente e cobrado mesmo
-- cancelado depois (o servico de marcar foi prestado), regra de 2026-08-23.

create or replace function public.cancela_agendamentos_sem_comanda()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  update public.appointments
     set status = 'cancelado'
   where status in ('agendado', 'confirmado')
     and data_hora_fim < now() - interval '15 minutes';
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke execute on function public.cancela_agendamentos_sem_comanda() from public, anon, authenticated;

select cron.schedule(
  'cancela-agendamentos-sem-comanda',
  '*/5 * * * *',
  $$select public.cancela_agendamentos_sem_comanda()$$
);
