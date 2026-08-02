-- Sincronização: traz para as migrations o que só existia em produção.
--
-- Os subsistemas de PLANOS/ASSINATURA e PACOTES DE CRÉDITO foram criados
-- direto no banco e nunca entraram no repositório. Resultado: um banco criado
-- a partir das migrations (dev local, `supabase db start`, o job de pgTAP no
-- CI) não tinha 7 tabelas, 1 view e 4 colunas que a aplicação usa.
--
-- Esta migration é INTEGRALMENTE IDEMPOTENTE de propósito: em produção, onde
-- tudo isso já existe, ela é no-op; num banco limpo, constrói o schema certo.
-- Por isso `if not exists` em tudo e `drop policy if exists` antes de cada
-- policy.
--
-- Extraída por introspecção do catálogo de produção em 2026-07-29.

-- ---------------------------------------------------------------------------
-- Planos e assinatura
-- ---------------------------------------------------------------------------
create table if not exists plans (
  codigo text primary key check (codigo in ('basico', 'pro')),
  nome text not null,
  descricao text,
  preco_unidade numeric(10,2) not null,
  preco_unidade_rede numeric(10,2) not null,
  recursos jsonb not null default '{}'::jsonb,
  ordem integer not null default 0,
  ativo boolean not null default true
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null unique references salons(id) on delete cascade,
  plan_codigo text not null references plans(codigo),
  status text not null default 'trial' check (status in ('trial', 'ativa', 'atrasada', 'cancelada')),
  asaas_customer_id text,
  asaas_subscription_id text,
  valor numeric(10,2),
  proximo_vencimento date,
  acesso_ate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_salon_idx on subscriptions (salon_id);
create index if not exists subscriptions_asaas_sub_idx on subscriptions (asaas_subscription_id);

-- ---------------------------------------------------------------------------
-- Pacotes de crédito
-- ---------------------------------------------------------------------------
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  validade_dias integer check (validade_dias is null or validade_dias > 0),
  vale_na_rede boolean not null default false,
  enviar_recibo_por_uso boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists packages_salon_idx on packages (salon_id);

create table if not exists package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  quantidade integer not null check (quantidade > 0),
  unique (package_id, service_id)
);

create table if not exists client_packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  package_id uuid not null references packages(id),
  order_id uuid references orders(id) on delete set null,
  comprado_em timestamptz not null default now(),
  expira_em date,
  valor_pago numeric(10,2) not null,
  valor_por_credito numeric(10,2) not null,
  status text not null default 'ativo' check (status in ('ativo', 'esgotado', 'expirado', 'cancelado')),
  aviso_saldo_baixo_em timestamptz,
  aviso_vencimento_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_packages_client_idx on client_packages (client_id);
create index if not exists client_packages_salon_idx on client_packages (salon_id);

create table if not exists client_package_credits (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid not null references client_packages(id) on delete cascade,
  service_id uuid not null references services(id),
  quantidade integer not null check (quantidade > 0),
  unique (client_package_id, service_id)
);

create table if not exists package_usages (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid not null references client_packages(id) on delete cascade,
  service_id uuid not null references services(id),
  order_item_id uuid references order_items(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null,
  usado_em timestamptz not null default now(),
  recibo_enviado boolean not null default false
);

create index if not exists package_usages_pacote_idx on package_usages (client_package_id);
create index if not exists package_usages_recibo_idx on package_usages (recibo_enviado) where (recibo_enviado = false);

-- ---------------------------------------------------------------------------
-- Colunas acrescentadas em tabelas que já existiam
-- ---------------------------------------------------------------------------
alter table order_items add column if not exists client_package_id uuid;
alter table order_items add column if not exists package_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_client_package_id_fkey') then
    alter table order_items add constraint order_items_client_package_id_fkey
      foreign key (client_package_id) references client_packages(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_package_id_fkey') then
    alter table order_items add constraint order_items_package_id_fkey
      foreign key (package_id) references packages(id) on delete set null;
  end if;
end $$;

-- Usada pelo fluxo de lembretes no n8n para não reenviar o mesmo lembrete.
alter table appointments add column if not exists lembrete_enviado boolean not null default false;

-- Prévia da última mensagem, mostrada na lista de conversas da aba WEB.
alter table whatsapp_conversations add column if not exists last_message_preview text;

-- ---------------------------------------------------------------------------
-- Saldo de créditos por pacote/serviço
-- ---------------------------------------------------------------------------
create or replace view client_package_saldo as
  select cp.id as client_package_id,
         cp.salon_id,
         cp.client_id,
         cp.status,
         cp.expira_em,
         cp.valor_por_credito,
         c.service_id,
         c.quantidade as total,
         count(u.id) as usados,
         c.quantidade - count(u.id) as saldo
    from client_packages cp
    join client_package_credits c on c.client_package_id = cp.id
    left join package_usages u on u.client_package_id = cp.id and u.service_id = c.service_id
   group by cp.id, c.service_id, c.quantidade;

-- ---------------------------------------------------------------------------
-- RLS
--
-- As tabelas-filha (package_items, client_package_credits, package_usages) não
-- têm salon_id: o escopo vem por herança do pai, via `in (select id from ...)`,
-- que por sua vez já está filtrado pelas policies do pai.
-- ---------------------------------------------------------------------------
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table packages enable row level security;
alter table package_items enable row level security;
alter table client_packages enable row level security;
alter table client_package_credits enable row level security;
alter table package_usages enable row level security;

drop policy if exists "plans: todos leem" on plans;
create policy "plans: todos leem" on plans
  for select using (ativo);

drop policy if exists "subscriptions: dono le" on subscriptions;
create policy "subscriptions: dono le" on subscriptions
  for select using (
    exists (
      select 1 from user_salons us
      where us.salon_id = subscriptions.salon_id
        and us.user_id = (select auth.uid())
        and us.role = 'owner'
    )
  );

drop policy if exists "packages: gestor gerencia" on packages;
create policy "packages: gestor gerencia" on packages
  for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

drop policy if exists "packages: membros leem" on packages;
create policy "packages: membros leem" on packages
  for select using (salon_id in (select private.salon_ids()));

drop policy if exists "package_items: gestor gerencia" on package_items;
create policy "package_items: gestor gerencia" on package_items
  for all
  using (exists (select 1 from packages p where p.id = package_items.package_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from packages p where p.id = package_items.package_id and private.is_manager(p.salon_id)));

drop policy if exists "package_items: segue o pacote" on package_items;
create policy "package_items: segue o pacote" on package_items
  for select using (package_id in (select id from packages));

drop policy if exists "client_packages: leitura conforme papel" on client_packages;
create policy "client_packages: leitura conforme papel" on client_packages
  for select using (
    salon_id in (select private.salon_ids())
    and (private.is_manager(salon_id) or client_id in (select private.my_client_ids()))
  );

drop policy if exists "client_packages: membros vendem" on client_packages;
create policy "client_packages: membros vendem" on client_packages
  for insert with check (salon_id in (select private.salon_ids()));

drop policy if exists "client_packages: gestor ajusta" on client_packages;
create policy "client_packages: gestor ajusta" on client_packages
  for update
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

drop policy if exists "client_package_credits: segue o pacote" on client_package_credits;
create policy "client_package_credits: segue o pacote" on client_package_credits
  for all
  using (client_package_id in (select id from client_packages))
  with check (client_package_id in (select id from client_packages));

drop policy if exists "package_usages: segue o pacote" on package_usages;
create policy "package_usages: segue o pacote" on package_usages
  for all
  using (client_package_id in (select id from client_packages))
  with check (client_package_id in (select id from client_packages));
