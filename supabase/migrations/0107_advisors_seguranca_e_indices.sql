-- Correcoes apontadas pelos advisors do Supabase no giro de 2026-08-25.
--
-- 1. Funcoes de trigger recem-criadas (0100, 0101, 0103) nasceram executaveis
--    via /rest/v1/rpc por anon/authenticated -- o padrao do projeto e revogar
--    de PUBLIC (regra da migration 0095). `esperado_no_caixa` autenticada era
--    um oraculo: chutando uuids, qualquer usuario leria o caixa de outro salao.
-- 2. Duas funcoes de trigger sem search_path fixo.
-- 3. Indices para as FKs que as consultas quentes do CRM realmente usam
--    (financeiro, ficha do cliente, comissoes, caixa, estoque).

revoke execute on function public.abre_caixa_na_venda() from public, anon, authenticated;
revoke execute on function public.esperado_no_caixa(uuid) from public, anon, authenticated;
grant execute on function public.esperado_no_caixa(uuid) to service_role;
revoke execute on function public.carimba_cancelamento() from public, anon, authenticated;
revoke execute on function public.limpa_aviso_de_estoque() from public, anon, authenticated;
revoke execute on function public.poda_historico_antigo() from public;
revoke execute on function public.cancela_agendamentos_sem_comanda() from public;
revoke execute on function public.fechar_caixas_do_dia() from public;

alter function public.carimba_cancelamento() set search_path = public, pg_temp;
alter function public.limpa_aviso_de_estoque() set search_path = public, pg_temp;

create index if not exists idx_appointments_service on public.appointments (service_id);
create index if not exists idx_appointments_cancelado_em on public.appointments (salon_id, cancelado_em) where cancelado_em is not null;
create index if not exists idx_orders_client on public.orders (client_id);
create index if not exists idx_orders_appointment on public.orders (appointment_id);
create index if not exists idx_order_items_service on public.order_items (service_id);
create index if not exists idx_order_items_professional on public.order_items (professional_id);
create index if not exists idx_order_items_product on public.order_items (product_id);
create index if not exists idx_commissions_order_item on public.commissions (order_item_id);
create index if not exists idx_cash_registers_salon on public.cash_registers (salon_id, status);
create index if not exists idx_stock_movements_product on public.stock_movements (product_id);
