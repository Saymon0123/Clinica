-- Cartao de fidelidade digital: a cada N atendimentos, o proximo sai de graca.
--
-- E o que a barbearia ja faz no papel. O produto nao inventa um modelo novo --
-- mata o cartaozinho que se perde e a discussao de balcao ("eu jurava que tinha
-- sete carimbos"), que e onde o papel falha.
--
-- **Os carimbos nao sao guardados: sao contados.** Um contador em coluna
-- dessincroniza na primeira venda cancelada, e ai o produto passa a ter o mesmo
-- defeito do papel -- um numero que ninguem sabe conferir. Contando das vendas
-- fechadas, cancelar uma venda tira o carimbo sozinho e nao existe nada para
-- acertar a mao.
--
-- O unico dado guardado e o **resgate**, porque ele nao da para deduzir: e a
-- decisao do barbeiro de entregar o premio. Ele fica amarrado a comanda, entao
-- cancelar a venda do brinde devolve os carimbos -- o cliente nao recebeu nada,
-- logo nao pode ter perdido o cartao.
--
-- **O brinde nao gera carimbo** (`preco_unitario > 0` na contagem), senao o
-- premio se alimentaria.

alter table public.salons
  add column if not exists fidelidade_a_cada integer not null default 0;

comment on column public.salons.fidelidade_a_cada is
  'Quantos atendimentos pagos o cliente precisa acumular para o proximo sair de graca. Zero desliga a fidelidade nesta barbearia.';

create table if not exists public.fidelidade_resgates (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create index if not exists fidelidade_resgates_cliente_idx
  on public.fidelidade_resgates (client_id, criado_em desc);

alter table public.fidelidade_resgates enable row level security;

drop policy if exists "equipe cuida dos resgates da sua barbearia" on public.fidelidade_resgates;
create policy "equipe cuida dos resgates da sua barbearia"
  on public.fidelidade_resgates for all
  using (salon_id in (select private.salon_ids()))
  with check (salon_id in (select private.salon_ids()));

comment on table public.fidelidade_resgates is
  'Quando o premio de fidelidade foi entregue. Zera a contagem: carimbos valem a partir do ultimo resgate. E o UNICO dado guardado da fidelidade -- os carimbos sao contados das vendas.';

-- Uma fonte so, consultada pelo caixa, pela ficha do cliente e, depois, pelo
-- agente do WhatsApp. O cliente que pergunta "quantos faltam?" recebe a mesma
-- resposta que esta na tela do barbeiro.
create or replace view public.fidelidade_do_cliente
with (security_invoker = on) as
with config as (
  select id as salon_id, fidelidade_a_cada as a_cada
    from public.salons
   where fidelidade_a_cada > 0 and ativo
),
ultimo_resgate as (
  select client_id, max(criado_em) as em
    from public.fidelidade_resgates
   group by client_id
),
contagem as (
  select o.client_id,
         o.salon_id,
         coalesce(sum(oi.quantidade), 0)::int as carimbos
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join ultimo_resgate ur on ur.client_id = o.client_id
   where o.status = 'fechada'
     and o.client_id is not null
     and oi.tipo = 'servico'
     and oi.preco_unitario > 0
     and coalesce(o.closed_at, o.created_at) > coalesce(ur.em, '-infinity'::timestamptz)
   group by o.client_id, o.salon_id
)
select cl.id as client_id,
       cl.salon_id,
       cfg.a_cada,
       coalesce(ct.carimbos, 0) as carimbos,
       greatest(cfg.a_cada - coalesce(ct.carimbos, 0), 0) as faltam,
       coalesce(ct.carimbos, 0) >= cfg.a_cada as tem_premio
  from public.clients cl
  join config cfg on cfg.salon_id = cl.salon_id
  left join contagem ct on ct.client_id = cl.id and ct.salon_id = cl.salon_id;

comment on view public.fidelidade_do_cliente is
  'Carimbos, quantos faltam e se ha premio a resgatar, por cliente. Contados das vendas fechadas desde o ultimo resgate -- nao ha contador guardado. Barbearia com fidelidade_a_cada = 0 nao aparece.';

insert into public.recursos (chave, nome, descricao, padrao)
values ('fidelidade', 'Fidelidade',
        'Cartao de fidelidade digital: a cada N atendimentos, o proximo sai de graca.', false)
on conflict (chave) do nothing;
