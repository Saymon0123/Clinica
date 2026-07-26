-- Salão CRM: schema inicial (MVP)

create table salons (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  telefone text,
  horario_funcionamento jsonb,
  created_at timestamptz not null default now()
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nome text not null,
  telefone text,
  ativo boolean not null default true,
  comissao_percentual numeric(5,2)
);

create table professional_schedules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  ativo boolean not null default true
);

create table services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  nome text not null,
  duracao_minutos integer not null,
  preco numeric(10,2) not null,
  ativo boolean not null default true
);

create table professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  unique (professional_id, service_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  nome text not null,
  telefone text,
  aniversario date,
  observacao text,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  data_hora_inicio timestamptz not null,
  data_hora_fim timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'concluido', 'cancelado', 'bloqueio')),
  recorrente_regra text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  nome text not null,
  preco_custo numeric(10,2),
  preco_venda numeric(10,2),
  estoque_atual integer not null default 0,
  estoque_minimo integer not null default 0,
  ativo boolean not null default true
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  quantidade integer not null,
  motivo text,
  created_at timestamptz not null default now()
);

create table cash_registers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  aberto_por uuid references auth.users(id),
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  valor_abertura numeric(10,2) not null default 0,
  valor_fechamento numeric(10,2),
  status text not null default 'aberto' check (status in ('aberto', 'fechado'))
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  cash_register_id uuid references cash_registers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'cancelada')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  tipo text not null check (tipo in ('servico', 'produto')),
  service_id uuid references services(id),
  product_id uuid references products(id),
  professional_id uuid references professionals(id),
  quantidade integer not null default 1,
  preco_unitario numeric(10,2) not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  forma_pagamento text not null
    check (forma_pagamento in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito')),
  valor numeric(10,2) not null
);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  percentual_aplicado numeric(5,2) not null,
  valor_calculado numeric(10,2) not null,
  pago boolean not null default false,
  pago_em timestamptz
);

-- RLS: cada usuário só acessa dados do próprio salão.
-- Assume que auth.users tem um vínculo salon_id via tabela de perfis (a criar
-- quando o cadastro do salão/usuário for implementado). Placeholder abaixo
-- habilita RLS; políticas concretas entram junto com a feature de auth/onboarding.

alter table salons enable row level security;
alter table professionals enable row level security;
alter table professional_schedules enable row level security;
alter table services enable row level security;
alter table professional_services enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table cash_registers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table commissions enable row level security;
