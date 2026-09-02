-- Nada sai a R$ 0,00 por acidente (migration 0132, Parte 2, passo 2.4 — achado 14).
--
-- O item da comanda herda o preço do catálogo. Produto sem preço virava linha
-- a R$ 0,00, e a comanda fechava assim — sem comissão, sem faturamento, sem
-- aviso. A trava vai na fonte: o catálogo não aceita mais zero nem vazio.
--
-- O que o banco NÃO trava, de propósito: o item da comanda a R$ 0,00. O único
-- zero legítimo no caixa é o consumo de pacote (o cliente já pagou antes), e o
-- item e o consumo chegam em pedidos separados — na hora do insert do item, o
-- banco não tem como saber que um consumo vem atrás. Essa regra vive no CRM.
-- A última asserção garante que ela CONTINUA possível no banco.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao 'cccc9000-0000-0000-0000-000000000001'

insert into salons (id, nome) values (:'salao', 'Barbearia do Teste');

-- ---------------------------------------------------------------------------
-- Produto
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into products (salon_id, nome, preco_venda, estoque_atual, estoque_minimo)
    values ('cccc9000-0000-0000-0000-000000000001', 'Pomada sem preco', null, 5, 1)$$,
  '23502',
  null,
  'produto sem preco de venda e recusado (campo obrigatorio)'
);

select throws_ok(
  $$insert into products (salon_id, nome, preco_venda, estoque_atual, estoque_minimo)
    values ('cccc9000-0000-0000-0000-000000000001', 'Pomada a zero', 0, 5, 1)$$,
  '23514',
  null,
  'produto a R$ 0,00 e recusado'
);

select throws_ok(
  $$insert into products (salon_id, nome, preco_venda, estoque_atual, estoque_minimo)
    values ('cccc9000-0000-0000-0000-000000000001', 'Pomada negativa', -10, 5, 1)$$,
  '23514',
  null,
  'produto com preco negativo e recusado'
);

select lives_ok(
  $$insert into products (salon_id, nome, preco_venda, estoque_atual, estoque_minimo)
    values ('cccc9000-0000-0000-0000-000000000001', 'Pomada', 35, 5, 1)$$,
  'produto com preco continua entrando'
);

-- ---------------------------------------------------------------------------
-- Serviço: a mesma regra, senão vira serviço que o caixa recusa
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into services (salon_id, nome, duracao_minutos, preco)
    values ('cccc9000-0000-0000-0000-000000000001', 'Retoque de graca', 15, 0)$$,
  '23514',
  null,
  'servico a R$ 0,00 e recusado -- cortesia e pacote ou desconto, nao preco zero'
);

select lives_ok(
  $$insert into services (id, salon_id, nome, duracao_minutos, preco)
    values ('cccc9000-0000-0000-0000-00000000000e', 'cccc9000-0000-0000-0000-000000000001', 'Corte', 40, 50)$$,
  'servico com preco continua entrando'
);

-- ---------------------------------------------------------------------------
-- O zero legítimo: consumo de pacote na comanda
-- ---------------------------------------------------------------------------

insert into orders (id, salon_id, status)
values ('cccc9000-0000-0000-0000-00000000000f', :'salao', 'aberta');

-- Se alguém um dia "consertar" isto com uma CHECK em order_items, o pacote
-- deixa de ser consumível no caixa — este teste é o aviso.
select lives_ok(
  $$insert into order_items (order_id, tipo, service_id, quantidade, preco_unitario)
    values ('cccc9000-0000-0000-0000-00000000000f', 'servico', 'cccc9000-0000-0000-0000-00000000000e', 1, 0)$$,
  'item da comanda a R$ 0,00 continua possivel no banco -- e o consumo de pacote'
);

select * from finish();
rollback;
