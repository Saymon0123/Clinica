-- FASE 3 — Convite de funcionários.
-- O dono cria o convite pelo app (RLS de gestor) e manda o link.
-- Quem aceita passa por Edge Function, porque criar conta exige service_role.

create table if not exists salon_invites (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  nome text not null,
  email text not null,
  role text not null default 'barbeiro' check (role in ('gerente', 'barbeiro')),
  comissao_percentual numeric(5,2),
  criado_por uuid references auth.users(id) on delete set null,
  expira_em timestamptz not null default (now() + interval '7 days'),
  usado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_salon_invites_salon on salon_invites (salon_id);
create index if not exists idx_salon_invites_token on salon_invites (token);

alter table salon_invites enable row level security;

create policy "salon_invites: gestor gerencia" on salon_invites for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));
