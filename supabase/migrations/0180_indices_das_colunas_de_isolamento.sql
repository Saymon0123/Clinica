-- 0180: índice em toda coluna de isolamento (achado na auditoria de RLS).
--
-- O filtro da RLS (`salon_id in (select private.salon_ids())`) roda em TODA
-- linha que a consulta toca, antes de qualquer outra coisa. Sem índice em
-- salon_id é varredura completa da tabela a cada consulta de cada barbearia.
--
-- Hoje não dói: é 1 salão, 13 clientes, 16 agendamentos. Dói no dia em que
-- entrar salão de verdade — e aí o sintoma aparece como "o sistema ficou
-- lento", sem apontar para cá. Por isso agora, enquanto criar índice é de
-- graça.
--
-- Oito tabelas tinham salon_id sem índice nenhum que começasse por ela.
-- `services`, `products` e `professionals` são as quentes: entram em quase
-- toda tela.

create index if not exists idx_services_salon            on public.services (salon_id);
create index if not exists idx_products_salon            on public.products (salon_id);
create index if not exists idx_professionals_salon       on public.professionals (salon_id);
create index if not exists idx_feedbacks_salon           on public.feedbacks (salon_id);
create index if not exists idx_termos_aceites_salon      on public.termos_aceites (salon_id);
create index if not exists idx_reativacao_envios_salon   on public.reativacao_envios (salon_id);
create index if not exists idx_mensagens_recebidas_salon on public.mensagens_recebidas (salon_id);
create index if not exists idx_avaliacao_pedidos_salon   on public.avaliacao_pedidos (salon_id);
