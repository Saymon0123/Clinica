-- Pacotes pre-pagos no lugar do cartao de carimbos (2026-08-26).
--
-- Decisao de produto: barbearia de hoje vende "pague R$120 e ganhe 5 cortes",
-- nao cartao de carimbo. O gestor monta o pacote do proprio catalogo (servicos
-- + quantidades + preco livre + validade), vende no caixa, e as visitas
-- seguintes DEBITAM creditos em vez de cobrar.
--
-- Regras que o schema carrega:
-- - Comissao: paga na VENDA do pacote (percentual do barbeiro sobre o valor
--   vendido). Consumo sai a R$0 e nao comissiona de novo -- decisao do dono
--   do produto em 26/08.
-- - Saldo e CONTADO, nunca guardado: creditos = contratado - consumos, e cada
--   consumo aponta para o order_item que o usou. Desfez a comanda, o credito
--   volta sozinho (cascade). Cancelou a venda do pacote, o pacote do cliente
--   some (cascade via order_id) -- mesma filosofia anti-dessincronizacao do
--   antigo carimbo, que era a parte boa dele.
-- - O carimbo se aposenta por completo: zero uso real (0 ajustes, 0 resgates).

-- ---------- O novo ----------

create table public.pacotes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  validade_dias integer check (validade_dias > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pacote_itens (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  quantidade integer not null check (quantidade > 0)
);

create table public.pacotes_do_cliente (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  pacote_id uuid not null references public.pacotes(id) on delete cascade,
  -- A comanda que vendeu o pacote. Cancelou a venda, o pacote some.
  order_id uuid not null references public.orders(id) on delete cascade,
  preco_pago numeric(10,2) not null,
  comprado_em timestamptz not null default now(),
  expira_em date
);

create table public.pacote_consumos (
  id uuid primary key default gen_random_uuid(),
  pacote_do_cliente_id uuid not null references public.pacotes_do_cliente(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  -- O item da comanda que usou o credito. Desfez a comanda, o credito volta.
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  consumido_em timestamptz not null default now()
);

create index idx_pacotes_salon on public.pacotes (salon_id);
create index idx_pacote_itens_pacote on public.pacote_itens (pacote_id);
create index idx_pacote_itens_service on public.pacote_itens (service_id);
create index idx_pacotes_do_cliente_client on public.pacotes_do_cliente (client_id);
create index idx_pacotes_do_cliente_salon on public.pacotes_do_cliente (salon_id);
create index idx_pacotes_do_cliente_order on public.pacotes_do_cliente (order_id);
create index idx_pacotes_do_cliente_pacote on public.pacotes_do_cliente (pacote_id);
create index idx_pacote_consumos_pdc on public.pacote_consumos (pacote_do_cliente_id);
create index idx_pacote_consumos_item on public.pacote_consumos (order_item_id);
create index idx_pacote_consumos_service on public.pacote_consumos (service_id);

-- A comanda aceita o tipo novo.
alter table public.order_items drop constraint order_items_tipo_check;
alter table public.order_items add constraint order_items_tipo_check
  check (tipo in ('servico', 'produto', 'pacote'));

-- ---------- RLS ----------
alter table public.pacotes enable row level security;
alter table public.pacote_itens enable row level security;
alter table public.pacotes_do_cliente enable row level security;
alter table public.pacote_consumos enable row level security;

-- Modelos: todos leem (o caixa precisa vender), so gestor gerencia.
create policy "pacotes: membros leem" on public.pacotes for select
  using (salon_id in (select private.salon_ids()));
create policy "pacotes: gestor gerencia" on public.pacotes for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

create policy "pacote_itens: membros leem" on public.pacote_itens for select
  using (pacote_id in (select id from public.pacotes where salon_id in (select private.salon_ids())));
create policy "pacote_itens: gestor gerencia" on public.pacote_itens for all
  using (exists (select 1 from public.pacotes p where p.id = pacote_id and private.is_manager(p.salon_id)))
  with check (exists (select 1 from public.pacotes p where p.id = pacote_id and private.is_manager(p.salon_id)));

-- Pacotes comprados: membros do salao leem (o caixa mostra o saldo) e a venda
-- insere; so gestor apaga. O insert exige a comanda do proprio vendedor
-- (mesma trava que fecha o buraco das comissoes forjadas: sem comanda visivel
-- pelo RLS de orders, nao ha pacote).
create policy "pacotes_do_cliente: membros leem" on public.pacotes_do_cliente for select
  using (salon_id in (select private.salon_ids()));
create policy "pacotes_do_cliente: nasce da venda" on public.pacotes_do_cliente for insert
  with check (
    salon_id in (select private.salon_ids())
    and order_id in (select id from public.orders)
  );
create policy "pacotes_do_cliente: gestor gerencia" on public.pacotes_do_cliente for all
  using (salon_id in (select private.salon_ids()) and private.is_manager(salon_id))
  with check (salon_id in (select private.salon_ids()) and private.is_manager(salon_id));

create policy "pacote_consumos: segue o pacote" on public.pacote_consumos for select
  using (pacote_do_cliente_id in (select id from public.pacotes_do_cliente));
create policy "pacote_consumos: nasce da venda" on public.pacote_consumos for insert
  with check (
    pacote_do_cliente_id in (select id from public.pacotes_do_cliente)
    and order_item_id in (select id from public.order_items)
  );

-- ---------- O saldo, contado ----------
create view public.saldo_de_pacotes
with (security_invoker = on) as
select pdc.id as pacote_do_cliente_id,
       pdc.salon_id,
       pdc.client_id,
       p.nome as pacote,
       pi.service_id,
       s.nome as servico,
       pi.quantidade as contratado,
       count(pc.id)::integer as consumido,
       (pi.quantidade - count(pc.id))::integer as restante,
       pdc.expira_em,
       (pdc.expira_em is not null and pdc.expira_em < current_date) as vencido,
       pdc.comprado_em
  from public.pacotes_do_cliente pdc
  join public.pacotes p on p.id = pdc.pacote_id
  join public.pacote_itens pi on pi.pacote_id = pdc.pacote_id
  join public.services s on s.id = pi.service_id
  left join public.pacote_consumos pc
    on pc.pacote_do_cliente_id = pdc.id and pc.service_id = pi.service_id
 group by pdc.id, pdc.salon_id, pdc.client_id, p.nome, pi.service_id, s.nome,
          pi.quantidade, pdc.expira_em, pdc.comprado_em;

grant select on public.saldo_de_pacotes to authenticated, service_role;

-- ---------- Aposentadoria do carimbo ----------
drop view if exists public.fidelidade_do_cliente;
drop view if exists public.fidelidade_historico;
drop table if exists public.fidelidade_ajustes;
drop table if exists public.fidelidade_resgates;
delete from public.recursos_do_salao where recurso = 'fidelidade';
delete from public.recursos where chave = 'fidelidade';
alter table public.salons
  drop column if exists fidelidade_a_cada,
  drop column if exists fidelidade_padrao_todos,
  drop column if exists fidelidade_validade_meses;
alter table public.clients
  drop column if exists fidelidade_participa,
  drop column if exists fidelidade_a_cada;
