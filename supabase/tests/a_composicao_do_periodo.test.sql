-- De onde vem o dinheiro (migration 0184) — parte 2 do item 14.
--
-- ## O que este teste existe para impedir
--
-- Que as duas bases de faturamento se misturem.
--
-- O cartão "Faturamento" da tela soma `payments.valor`, e NÃO os itens da
-- comanda. As duas contas divergem sempre que houver desconto, pacote cobrindo
-- item ou pagamento parcial. Se o ticket médio saísse dos itens, a tela
-- mostraria dois números que se contradizem e quem olha não teria como saber
-- qual crer.
--
-- Por isso a fixture tem um DESCONTO de propósito: a comanda 2 vale R$ 100 em
-- item e foi paga com R$ 70. Daí faturamento (450) e vendido (480) precisam
-- sair diferentes — se um dia alguém "simplificar" a função para uma base só,
-- é aqui que aparece.
--
-- ## O cenário
--
--   Anteontem: comanda 1 = serviço 100 + produto 50, paga 150
--              comanda 2 = serviço 100,             paga  70  (desconto)
--   Ontem:     comanda 3 = pacote 200,              paga 200
--              comanda 4 = produto 30,              paga  30
--   E mais uma ABERTA e uma CANCELADA, que não podem entrar em conta nenhuma.
--
-- Daí: faturamento 450, vendido 480 (serviço 200, produto 80, pacote 200),
-- 4 comandas, e o melhor dia é ONTEM com 230 -- o desconto de anteontem tirou
-- dele a liderança, o que prova que o melhor dia também olha o pago.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

\set salao  'bbbb9000-0000-0000-0000-000000000001'
\set u_dono 'bbbb9500-0000-0000-0000-000000000001'
\set u_barb 'bbbb9500-0000-0000-0000-000000000002'
\set prof   'bbbb9100-0000-0000-0000-000000000001'
\set o1     'bbbb9600-0000-0000-0000-000000000001'
\set o2     'bbbb9600-0000-0000-0000-000000000002'
\set o3     'bbbb9600-0000-0000-0000-000000000003'
\set o4     'bbbb9600-0000-0000-0000-000000000004'
\set o_ab   'bbbb9600-0000-0000-0000-000000000005'
\set o_can  'bbbb9600-0000-0000-0000-000000000006'

-- Ontem e anteontem no relógio de São Paulo: o runner do CI vive em UTC.
create or replace function pg_temp.ontem() returns date
language sql as $$ select ((now() at time zone 'America/Sao_Paulo')::date - 1) $$;
create or replace function pg_temp.anteontem() returns date
language sql as $$ select ((now() at time zone 'America/Sao_Paulo')::date - 2) $$;
create or replace function pg_temp.em(d date, h text) returns timestamptz
language sql as $$ select (d::text || ' ' || h)::timestamp at time zone 'America/Sao_Paulo' $$;

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

insert into auth.users (id, email) values
  (:'u_dono', 'dono@teste184.local'),
  (:'u_barb', 'barbeiro@teste184.local');

insert into salons (id, nome, ativo) values (:'salao', 'De Onde Vem', true);
insert into user_salons (user_id, salon_id, role) values
  (:'u_dono', :'salao', 'owner'),
  (:'u_barb', :'salao', 'barbeiro');
insert into professionals (id, salon_id, nome, ativo, user_id)
values (:'prof', :'salao', 'Cadeira', true, :'u_barb');

insert into orders (id, salon_id, status, closed_at) values
  (:'o1',   :'salao', 'fechada',   pg_temp.em(pg_temp.anteontem(), '10:00')),
  (:'o2',   :'salao', 'fechada',   pg_temp.em(pg_temp.anteontem(), '11:00')),
  (:'o3',   :'salao', 'fechada',   pg_temp.em(pg_temp.ontem(),     '10:00')),
  (:'o4',   :'salao', 'fechada',   pg_temp.em(pg_temp.ontem(),     '11:00')),
  (:'o_ab', :'salao', 'aberta',    null),
  (:'o_can',:'salao', 'cancelada', pg_temp.em(pg_temp.ontem(),     '12:00'));

insert into order_items (order_id, tipo, preco_unitario, quantidade) values
  (:'o1', 'servico', 100, 1),
  (:'o1', 'produto',  50, 1),
  (:'o2', 'servico', 100, 1),
  (:'o3', 'pacote',  200, 1),
  (:'o4', 'produto',  30, 1),
  -- As duas que não podem entrar, com valores absurdos de propósito: se
  -- escaparem, nenhum número do teste fecha.
  (:'o_ab',  'servico', 999, 1),
  (:'o_can', 'produto', 999, 1);

insert into payments (order_id, forma_pagamento, valor) values
  (:'o1', 'pix',      150),
  (:'o2', 'dinheiro',  70),
  (:'o3', 'pix',      200),
  (:'o4', 'dinheiro',  30),
  (:'o_can', 'pix',   999);

select pg_temp.entrar_como(:'u_dono');

select is(
  (select faturamento from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  450::numeric,
  'faturamento sai dos PAYMENTS: 450, com o desconto da comanda 2 descontado de verdade'
);

select is(
  (select vendido_total from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  480::numeric,
  'vendido sai dos ITENS: 480 -- diferente do faturamento, e tem de continuar diferente'
);

select is(
  (select comandas from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  4,
  'quatro comandas: a aberta e a cancelada ficaram de fora'
);

select is(
  (select vendido_servico from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  200::numeric,
  'servico: 200'
);

select is(
  (select vendido_produto from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  80::numeric,
  'produto: 80 -- os 999 da comanda cancelada nao entraram'
);

select is(
  (select vendido_pacote from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  200::numeric,
  'pacote: 200 -- ele e um TERCEIRO tipo, e nao parte de servico nem de produto'
);

select is(
  (select melhor_dia from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  extract(dow from pg_temp.ontem())::smallint,
  'o melhor dia e ontem (230) e nao anteontem (220): o desconto mudou a lideranca'
);

select is(
  (select melhor_dia_faturamento from composicao_do_periodo(:'salao', pg_temp.anteontem(), pg_temp.ontem())),
  230::numeric,
  'e o valor do melhor dia sai do pago, nao do vendido'
);

select pg_temp.entrar_como(:'u_barb');

select throws_ok(
  format($$select faturamento from composicao_do_periodo(%L, %L::date, %L::date)$$,
         :'salao', pg_temp.anteontem(), pg_temp.ontem()),
  '42501', null,
  'o barbeiro nao le o faturamento da barbearia -- as taxas dele estao na outra RPC'
);

select * from finish();
rollback;
