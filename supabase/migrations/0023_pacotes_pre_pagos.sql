-- Pacotes pré-pagos (fidelidade).
--
-- O cliente compra N atendimentos com desconto e consome ao longo do tempo.
-- O dinheiro entra na venda; o serviço é entregue depois. Por isso o saldo
-- precisa ser confiável e o valor do crédito precisa ficar congelado.

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10, 2) not null check (preco >= 0),
  -- null = não vence
  validade_dias int check (validade_dias is null or validade_dias > 0),
  -- Vale em qualquer unidade da mesma rede, não só na que vendeu.
  vale_na_rede boolean not null default false,
  -- Recibo a cada uso vira spam para quem corta toda semana.
  enviar_recibo_por_uso boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists packages_salon_idx on packages (salon_id);

create table if not exists package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  quantidade int not null check (quantidade > 0),
  unique (package_id, service_id)
);

create table if not exists client_packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  package_id uuid not null references packages(id),
  -- Venda que originou o pacote (rastreabilidade e estorno).
  order_id uuid references orders(id) on delete set null,
  comprado_em timestamptz not null default now(),
  expira_em date,
  valor_pago numeric(10, 2) not null,
  -- Snapshot de valor_pago / total de créditos. Congelado na compra: mudar o
  -- preço do pacote depois não pode alterar comissão já apurada.
  valor_por_credito numeric(10, 2) not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'esgotado', 'expirado', 'cancelado')),
  -- Evitam mandar o mesmo aviso duas vezes (mesma ideia de lembrete_enviado).
  aviso_saldo_baixo_em timestamptz,
  aviso_vencimento_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_packages_client_idx on client_packages (client_id);
create index if not exists client_packages_salon_idx on client_packages (salon_id);

-- Snapshot das quantidades: o pacote pode ser editado depois da venda, e o
-- que o cliente comprou não muda por isso.
create table if not exists client_package_credits (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid not null references client_packages(id) on delete cascade,
  service_id uuid not null references services(id),
  quantidade int not null check (quantidade > 0),
  unique (client_package_id, service_id)
);

-- Cada baixa. O saldo é sempre `quantidade` menos os usos — nunca um contador
-- guardado, que sairia de sincronia. Cancelar a comanda apaga o item e, por
-- cascade, o uso: o crédito volta sem rotina de estorno.
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
create index if not exists package_usages_recibo_idx on package_usages (recibo_enviado)
  where recibo_enviado = false;

-- Liga o item da comanda ao pacote que o cobriu. Item coberto entra com
-- preco_unitario 0; a comissão sai do valor_por_credito.
alter table order_items add column if not exists client_package_id uuid
  references client_packages(id) on delete set null;

-- Novo tipo de item: venda do pacote em si.
alter table order_items drop constraint if exists order_items_tipo_check;
alter table order_items add constraint order_items_tipo_check
  check (tipo in ('servico', 'produto', 'pacote'));

alter table order_items add column if not exists package_id uuid
  references packages(id) on delete set null;

-- Saldo pronto para as telas, sem repetir o cálculo em cada consulta.
create or replace view client_package_saldo as
select
  cp.id as client_package_id,
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
left join package_usages u
  on u.client_package_id = cp.id and u.service_id = c.service_id
group by cp.id, c.service_id, c.quantidade;

alter table packages enable row level security;
alter table package_items enable row level security;
alter table client_packages enable row level security;
alter table client_package_credits enable row level security;
alter table package_usages enable row level security;

-- Catálogo de pacotes: todo membro lê (o barbeiro vende), só gestor mexe.
drop policy if exists "packages: membros leem" on packages;
create policy "packages: membros leem" on packages
  for select using (salon_id in (select private.salon_ids()));

drop policy if exists "packages: gestor gerencia" on packages;
create policy "packages: gestor gerencia" on packages
  for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

drop policy if exists "package_items: segue o pacote" on package_items;
create policy "package_items: segue o pacote" on package_items
  for select using (package_id in (select id from packages));

drop policy if exists "package_items: gestor gerencia" on package_items;
create policy "package_items: gestor gerencia" on package_items
  for all
  using (exists (select 1 from packages p where p.id = package_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from packages p where p.id = package_id and private.is_manager(p.salon_id)));

-- Pacote do cliente: quem enxerga o cliente enxerga o pacote dele. O barbeiro
-- vende e dá baixa, então precisa de insert também.
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
