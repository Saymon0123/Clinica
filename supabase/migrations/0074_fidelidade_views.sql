-- A contagem passa a respeitar participacao, meta individual, ajustes e
-- validade; e nasce o historico do cartao.
--
-- `drop view` antes de criar, e nao `create or replace`: a lista de colunas
-- mudou no meio (entrou `validade_meses`), e o Postgres recusa com 42P16. Mesma
-- pedra da migration `0062`.

drop view if exists public.fidelidade_do_cliente;

create view public.fidelidade_do_cliente
with (security_invoker = on) as
with base as (
  select cl.id as client_id,
         cl.salon_id,
         coalesce(cl.fidelidade_a_cada, s.fidelidade_a_cada) as a_cada,
         coalesce(cl.fidelidade_participa, s.fidelidade_padrao_todos) as participa,
         s.fidelidade_validade_meses as validade
    from public.clients cl
    join public.salons s on s.id = cl.salon_id
   where s.ativo
),
janela as (
  select b.*,
         -- O carimbo vale a partir do que veio depois: o ultimo resgate ou o
         -- inicio da validade. Quem sumiu dois anos nao volta cobrando premio.
         greatest(
           coalesce((select max(r.criado_em) from public.fidelidade_resgates r
                      where r.client_id = b.client_id), '-infinity'::timestamptz),
           case when b.validade > 0 then now() - make_interval(months => b.validade)
                else '-infinity'::timestamptz end
         ) as desde
    from base b
   where b.participa and b.a_cada > 0
),
das_vendas as (
  select j.client_id, coalesce(sum(oi.quantidade), 0)::int as carimbos
    from janela j
    join public.orders o on o.client_id = j.client_id and o.salon_id = j.salon_id
    join public.order_items oi on oi.order_id = o.id
   where o.status = 'fechada'
     and oi.tipo = 'servico'
     -- O proprio brinde nao gera carimbo, senao o premio se alimenta.
     and oi.preco_unitario > 0
     and coalesce(o.closed_at, o.created_at) > j.desde
   group by j.client_id
),
dos_ajustes as (
  select j.client_id, coalesce(sum(a.carimbos), 0)::int as carimbos
    from janela j
    join public.fidelidade_ajustes a on a.client_id = j.client_id
   where a.criado_em > j.desde
   group by j.client_id
)
select j.client_id,
       j.salon_id,
       j.a_cada,
       j.validade as validade_meses,
       -- Ajuste negativo nao pode gerar contagem abaixo de zero.
       greatest(coalesce(v.carimbos, 0) + coalesce(aj.carimbos, 0), 0) as carimbos,
       greatest(j.a_cada - (coalesce(v.carimbos, 0) + coalesce(aj.carimbos, 0)), 0) as faltam,
       (coalesce(v.carimbos, 0) + coalesce(aj.carimbos, 0)) >= j.a_cada as tem_premio
  from janela j
  left join das_vendas v on v.client_id = j.client_id
  left join dos_ajustes aj on aj.client_id = j.client_id;

comment on view public.fidelidade_do_cliente is
  'Carimbos, quantos faltam e se ha premio, por cliente que participa. Contados das vendas fechadas mais os ajustes manuais, desde o ultimo resgate ou o inicio da validade. Quem nao participa nao aparece.';

-- O historico que encerra discussao no balcao: o que entrou, o que saiu e por
-- que. Le os mesmos fatos que a contagem, entao nunca discorda dela -- se
-- fossem duas fontes, um dia diriam numeros diferentes na frente do cliente.
create or replace view public.fidelidade_historico
with (security_invoker = on) as
select o.client_id, o.salon_id,
       coalesce(o.closed_at, o.created_at) as quando,
       'carimbo' as evento,
       oi.quantidade as carimbos,
       'Atendimento pago' as detalhe
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
 where o.status = 'fechada' and o.client_id is not null
   and oi.tipo = 'servico' and oi.preco_unitario > 0

union all

select r.client_id, r.salon_id, r.criado_em, 'resgate', 0, 'Premio entregue'
  from public.fidelidade_resgates r

union all

select a.client_id, a.salon_id, a.criado_em, 'ajuste', a.carimbos, a.motivo
  from public.fidelidade_ajustes a;

comment on view public.fidelidade_historico is
  'Linha do tempo do cartao: carimbos por atendimento, resgates e ajustes manuais com motivo. Le os mesmos fatos que fidelidade_do_cliente conta.';
