-- FASE 0 — Fundação para funcionários e rede de barbearias.
--
-- Esta migration é puramente ADITIVA: cria estrutura nova e preenche com os
-- vínculos atuais, mas NÃO altera nenhuma política existente. A função antiga
-- auth_salon_id() continua valendo, então o app segue funcionando idêntico.
-- A troca das políticas acontece na Fase 1, isolada e testável.

-- 1. Rede (agrupa várias unidades). Barbearia única não precisa de rede.
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

alter table salons
  add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists idx_salons_organization on salons (organization_id);

-- 2. Vínculo usuário <-> salão <-> papel.
--    Um usuário pode ter papéis diferentes em unidades diferentes, o que cobre
--    dono de uma barbearia, funcionário, dono de rede e gerente de unidade.
create table if not exists user_salons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  role text not null default 'barbeiro' check (role in ('owner', 'gerente', 'barbeiro')),
  created_at timestamptz not null default now(),
  unique (user_id, salon_id)
);

create index if not exists idx_user_salons_user on user_salons (user_id);
create index if not exists idx_user_salons_salon on user_salons (salon_id);

-- 3. Preenche os vínculos a partir de quem já existe hoje (todos são donos).
insert into user_salons (user_id, salon_id, role)
select p.id, p.salon_id, coalesce(nullif(p.role, ''), 'owner')
from profiles p
where p.salon_id is not null
on conflict (user_id, salon_id) do nothing;

-- 4. Funções auxiliares que a Fase 1 vai usar nas políticas.
--    SECURITY DEFINER para poderem ler user_salons sem cair na própria RLS.
--    Todas devolvem informação apenas sobre o usuário que as chama.

-- Todos os salões que o usuário logado pode acessar.
create or replace function auth_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from user_salons where user_id = (select auth.uid())
$$;

-- Papel do usuário num salão específico.
create or replace function auth_role(p_salon_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from user_salons
  where user_id = (select auth.uid()) and salon_id = p_salon_id
$$;

-- Dono ou gerente têm visão completa da unidade.
create or replace function auth_is_manager(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_salons
    where user_id = (select auth.uid())
      and salon_id = p_salon_id
      and role in ('owner', 'gerente')
  )
$$;

-- Ficha de profissional do usuário logado dentro de um salão (para escopo
-- do funcionário: "só o que é meu").
create or replace function auth_professional_id(p_salon_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from professionals
  where user_id = (select auth.uid()) and salon_id = p_salon_id
  limit 1
$$;

-- 5. RLS das tabelas novas.
alter table organizations enable row level security;
alter table user_salons enable row level security;

-- Sem recursão: olha só a coluna user_id, não chama auth_salon_ids().
create policy "user_salons: vê os próprios vínculos"
  on user_salons for select
  using (user_id = (select auth.uid()));

create policy "organizations: vê a rede das suas unidades"
  on organizations for select
  using (
    id in (select organization_id from salons where id in (select auth_salon_ids()))
  );
