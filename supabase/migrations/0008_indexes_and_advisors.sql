-- Correções de performance/segurança apontadas pelos advisors do Supabase.

-- 1. Índices nas colunas mais consultadas (todo filtro do app usa salon_id).
create index if not exists idx_appointments_salon_inicio
  on appointments (salon_id, data_hora_inicio);
create index if not exists idx_appointments_professional
  on appointments (professional_id);
create index if not exists idx_orders_salon_status_closed
  on orders (salon_id, status, closed_at);
create index if not exists idx_order_items_order
  on order_items (order_id);
create index if not exists idx_payments_order
  on payments (order_id);
create index if not exists idx_clients_salon
  on clients (salon_id);

-- 2. RLS de profiles: usar (select auth.uid()) para não reavaliar por linha.
drop policy if exists "Usuário vê o próprio perfil" on profiles;
create policy "Usuário vê o próprio perfil"
  on profiles for select
  using (id = (select auth.uid()));

-- 3. Fixar search_path da função de trigger (evita search_path mutável).
alter function public.whatsapp_touch_conversation() set search_path = public;
