-- FASE 2 — Suporte ao cadastro novo e ao painel administrativo.

-- Barbearia ativa/inativa (para suspender sem apagar o histórico).
alter table salons
  add column if not exists ativo boolean not null default true;

-- Desativar a barbearia corta o acesso de todo mundo dela na hora,
-- porque salon_ids() é a base de todas as políticas.
create or replace function private.salon_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select us.salon_id
  from user_salons us
  join salons s on s.id = us.salon_id
  where us.user_id = (select auth.uid())
    and s.ativo
$$;

create index if not exists idx_salons_ativo on salons (ativo);
