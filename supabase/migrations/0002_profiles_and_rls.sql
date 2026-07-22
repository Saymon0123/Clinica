-- Vincula usuário autenticado a um salão (multi-tenant)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Usuário vê o próprio perfil"
  on profiles for select
  using (id = auth.uid());

-- Helper: salão do usuário logado
create or replace function auth_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from profiles where id = auth.uid()
$$;

-- Políticas: usuário só acessa dados do próprio salão
create policy "salons: acesso ao próprio salão" on salons
  for all using (id = auth_salon_id()) with check (id = auth_salon_id());

create policy "professionals: acesso ao próprio salão" on professionals
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "professional_schedules: acesso ao próprio salão" on professional_schedules
  for all using (professional_id in (select id from professionals where salon_id = auth_salon_id()))
  with check (professional_id in (select id from professionals where salon_id = auth_salon_id()));

create policy "services: acesso ao próprio salão" on services
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "professional_services: acesso ao próprio salão" on professional_services
  for all using (professional_id in (select id from professionals where salon_id = auth_salon_id()))
  with check (professional_id in (select id from professionals where salon_id = auth_salon_id()));

create policy "clients: acesso ao próprio salão" on clients
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "appointments: acesso ao próprio salão" on appointments
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "products: acesso ao próprio salão" on products
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "stock_movements: acesso ao próprio salão" on stock_movements
  for all using (product_id in (select id from products where salon_id = auth_salon_id()))
  with check (product_id in (select id from products where salon_id = auth_salon_id()));

create policy "cash_registers: acesso ao próprio salão" on cash_registers
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "orders: acesso ao próprio salão" on orders
  for all using (salon_id = auth_salon_id()) with check (salon_id = auth_salon_id());

create policy "order_items: acesso ao próprio salão" on order_items
  for all using (order_id in (select id from orders where salon_id = auth_salon_id()))
  with check (order_id in (select id from orders where salon_id = auth_salon_id()));

create policy "payments: acesso ao próprio salão" on payments
  for all using (order_id in (select id from orders where salon_id = auth_salon_id()))
  with check (order_id in (select id from orders where salon_id = auth_salon_id()));

create policy "commissions: acesso ao próprio salão" on commissions
  for all using (professional_id in (select id from professionals where salon_id = auth_salon_id()))
  with check (professional_id in (select id from professionals where salon_id = auth_salon_id()));
