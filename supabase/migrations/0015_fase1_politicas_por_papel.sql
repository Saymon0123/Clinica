-- FASE 1 — Políticas por papel (dono/gerente x barbeiro) e suporte a rede.
--
-- Escopo do barbeiro: agenda só dele, clientes só quem atendeu/cadastrou,
-- fecha a própria comanda, comissão dele em tempo real, catálogo só leitura,
-- sem acesso a WhatsApp, caixa e equipe.
--
-- ATENÇÃO à ordem: a coluna clients.created_by precisa existir ANTES das
-- funções que a referenciam, senão a migration falha ao validar o corpo.

-- 1. Autoria do cliente (para o barbeiro não perder de vista quem ele mesmo
--    acabou de cadastrar e ainda não atendeu).
alter table clients
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table clients alter column created_by set default auth.uid();

create index if not exists idx_clients_created_by on clients (created_by);
create index if not exists idx_professionals_user on professionals (user_id);
create index if not exists idx_orders_professional on orders (professional_id);
create index if not exists idx_appointments_client on appointments (client_id);
create index if not exists idx_commissions_professional on commissions (professional_id);

-- 2. Schema privado: fora de "public" o PostgREST não expõe as funções como
--    RPC, o que elimina os avisos de SECURITY DEFINER exposto.
create schema if not exists private;
grant usage on schema private to authenticated, anon;

create or replace function private.salon_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select salon_id from user_salons where user_id = (select auth.uid())
$$;

create or replace function private.is_manager(p_salon_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_salons
    where user_id = (select auth.uid())
      and salon_id = p_salon_id
      and role in ('owner', 'gerente')
  )
$$;

-- Sem argumento de propósito: o Postgres avalia uma vez por consulta.
create or replace function private.my_professional_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from professionals where user_id = (select auth.uid())
$$;

create or replace function private.my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.client_id from appointments a
    where a.client_id is not null
      and a.professional_id in (select id from professionals where user_id = (select auth.uid()))
  union
  select o.client_id from orders o
    where o.client_id is not null
      and o.professional_id in (select id from professionals where user_id = (select auth.uid()))
  union
  select c.id from clients c where c.created_by = (select auth.uid())
$$;

grant execute on all functions in schema private to authenticated, anon;

-- 3. Remove as políticas antigas (todas eram "FOR ALL" sem papel).
drop policy if exists "salons: acesso ao próprio salão" on salons;
drop policy if exists "professionals: acesso ao próprio salão" on professionals;
drop policy if exists "professional_schedules: acesso ao próprio salão" on professional_schedules;
drop policy if exists "services: acesso ao próprio salão" on services;
drop policy if exists "professional_services: acesso ao próprio salão" on professional_services;
drop policy if exists "clients: acesso ao próprio salão" on clients;
drop policy if exists "appointments: acesso ao próprio salão" on appointments;
drop policy if exists "products: acesso ao próprio salão" on products;
drop policy if exists "stock_movements: acesso ao próprio salão" on stock_movements;
drop policy if exists "cash_registers: acesso ao próprio salão" on cash_registers;
drop policy if exists "orders: acesso ao próprio salão" on orders;
drop policy if exists "order_items: acesso ao próprio salão" on order_items;
drop policy if exists "payments: acesso ao próprio salão" on payments;
drop policy if exists "commissions: acesso ao próprio salão" on commissions;
drop policy if exists "whatsapp_connections: acesso ao próprio salão" on whatsapp_connections;
drop policy if exists "whatsapp_conversations: acesso ao próprio salão" on whatsapp_conversations;
drop policy if exists "whatsapp_messages: acesso ao próprio salão" on whatsapp_messages;
drop policy if exists "organizations: vê a rede das suas unidades" on organizations;

-- 4. SALÃO e REDE
create policy "salons: membros leem" on salons for select
  using (id in (select private.salon_ids()));
create policy "salons: gestor altera" on salons for update
  using (private.is_manager(id)) with check (private.is_manager(id));

create policy "organizations: membros leem a rede" on organizations for select
  using (id in (select organization_id from salons where id in (select private.salon_ids())));

-- 5. EQUIPE — barbeiro vê só a própria ficha (protege a comissão dos colegas).
create policy "professionals: leitura conforme papel" on professionals for select
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or id in (select private.my_professional_ids()))
  );
create policy "professionals: gestor gerencia" on professionals for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

create policy "professional_schedules: leitura conforme papel" on professional_schedules for select
  using (
    professional_id in (select id from professionals where salon_id in (select private.salon_ids()))
    and (
      professional_id in (select private.my_professional_ids())
      or exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id))
    )
  );
create policy "professional_schedules: gestor gerencia" on professional_schedules for all
  using (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)));

-- 6. CATÁLOGO — todos leem (barbeiro precisa dos preços); só gestor altera.
create policy "services: membros leem" on services for select
  using (salon_id in (select private.salon_ids()));
create policy "services: gestor gerencia" on services for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

create policy "products: membros leem" on products for select
  using (salon_id in (select private.salon_ids()));
create policy "products: gestor gerencia" on products for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

create policy "professional_services: membros leem" on professional_services for select
  using (professional_id in (select id from professionals where salon_id in (select private.salon_ids())));
create policy "professional_services: gestor gerencia" on professional_services for all
  using (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)));

-- 7. CLIENTES — barbeiro vê só quem atendeu ou cadastrou.
create policy "clients: leitura conforme papel" on clients for select
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or id in (select private.my_client_ids()))
  );
create policy "clients: membros cadastram" on clients for insert
  with check (salon_id in (select private.salon_ids()));
create policy "clients: edita quem enxerga" on clients for update
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or id in (select private.my_client_ids()))
  )
  with check (salon_id in (select private.salon_ids()));
create policy "clients: gestor exclui" on clients for delete
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

-- 8. AGENDA — barbeiro só enxerga e mexe nos agendamentos dele.
create policy "appointments: leitura conforme papel" on appointments for select
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  );
create policy "appointments: cria conforme papel" on appointments for insert
  with check (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  );
create policy "appointments: altera conforme papel" on appointments for update
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  )
  with check (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  );
create policy "appointments: exclui conforme papel" on appointments for delete
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  );

-- 9. VENDAS — barbeiro fecha a própria comanda e vê só as dele.
create policy "orders: acesso conforme papel" on orders for all
  using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  )
  with check (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or professional_id in (select private.my_professional_ids()))
  );

-- Itens e pagamentos herdam a visibilidade da comanda.
create policy "order_items: segue a comanda" on order_items for all
  using (order_id in (select id from orders))
  with check (order_id in (select id from orders));
create policy "payments: segue a comanda" on payments for all
  using (order_id in (select id from orders))
  with check (order_id in (select id from orders));

-- 10. COMISSÕES — barbeiro vê a dele em tempo real.
create policy "commissions: leitura conforme papel" on commissions for select
  using (
    professional_id in (select id from professionals where salon_id in (select private.salon_ids()))
    and (
      professional_id in (select private.my_professional_ids())
      or exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id))
    )
  );
create policy "commissions: registrada pela venda" on commissions for insert
  with check (professional_id in (select id from professionals where salon_id in (select private.salon_ids())));
create policy "commissions: gestor gerencia" on commissions for all
  using (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from professionals p where p.id = professional_id and private.is_manager(p.salon_id)));

-- 11. ESTOQUE — a venda do barbeiro dá baixa; ajuste manual é do gestor.
create policy "stock_movements: membros leem" on stock_movements for select
  using (product_id in (select id from products where salon_id in (select private.salon_ids())));
create policy "stock_movements: baixa pela venda" on stock_movements for insert
  with check (product_id in (select id from products where salon_id in (select private.salon_ids())));
create policy "stock_movements: gestor gerencia" on stock_movements for all
  using (exists (select 1 from products pr where pr.id = product_id and private.is_manager(pr.salon_id)))
  with check (exists (select 1 from products pr where pr.id = product_id and private.is_manager(pr.salon_id)));

-- 12. CAIXA e WHATSAPP — exclusivos do dono/gerente.
create policy "cash_registers: gestor" on cash_registers for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));
create policy "whatsapp_connections: gestor" on whatsapp_connections for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));
create policy "whatsapp_conversations: gestor" on whatsapp_conversations for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));
create policy "whatsapp_messages: gestor" on whatsapp_messages for all
  using (conversation_id in (select id from whatsapp_conversations))
  with check (conversation_id in (select id from whatsapp_conversations));

-- 13. EQUIPE (vínculos) — gestor enxerga e gerencia a equipe da unidade.
create policy "user_salons: gestor vê a equipe" on user_salons for select
  using (private.is_manager(salon_id));
create policy "user_salons: gestor gerencia a equipe" on user_salons for all
  using (private.is_manager(salon_id))
  with check (private.is_manager(salon_id));

-- 14. Remove as funções antigas do schema público (nada mais as usa).
drop function if exists auth_salon_ids();
drop function if exists auth_role(uuid);
drop function if exists auth_is_manager(uuid);
drop function if exists auth_professional_id(uuid);
drop function if exists auth_salon_id();
