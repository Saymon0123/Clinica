-- Isolamento multi-tenant nas tabelas de OPERAÇÃO — dinheiro, agenda e conversa.
--
-- O `rls_isolamento_entre_saloes.test.sql` cobre `clients`, `salons` e
-- `services`: 3 tabelas de 54. O giro de 10/09 (achado A16) apontou que o resto
-- do sistema — inclusive tudo que é dinheiro — nunca teve vazamento entre
-- barbearias verificado. Com UMA barbearia isso é teórico; com a segunda
-- pagante, é produção.
--
-- A metade que mais preocupa está marcada abaixo: **tabelas SEM `salon_id`**.
-- `payments`, `order_items`, `commissions`, `stock_movements` e
-- `whatsapp_messages` não têm coluna de dono — o isolamento delas depende
-- inteiramente de a policy fazer o join até o pai. Uma policy reescrita sem
-- esse join vaza sem erro, sem log e sem sintoma na tela.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(22);

-- ---------------------------------------------------------------------------
-- Fixture: dois salões completos e espelhados, cada um com uma venda fechada,
-- um agendamento, uma conversa e um pacote vendido.
-- ---------------------------------------------------------------------------
\set salao_a 'aaaa1111-1111-1111-1111-111111111111'
\set salao_b 'bbbb1111-1111-1111-1111-111111111111'
\set dono_a  'aaaa2222-0000-0000-0000-000000000001'
\set dono_b  'bbbb2222-0000-0000-0000-000000000001'

\set prof_a  'aaaa3333-0000-0000-0000-00000000000a'
\set prof_b  'bbbb3333-0000-0000-0000-00000000000b'
\set cli_a   'aaaa4444-0000-0000-0000-00000000000a'
\set cli_b   'bbbb4444-0000-0000-0000-00000000000b'
\set serv_a  'aaaa5555-0000-0000-0000-00000000000a'
\set serv_b  'bbbb5555-0000-0000-0000-00000000000b'
\set prod_a  'aaaa6666-0000-0000-0000-00000000000a'
\set prod_b  'bbbb6666-0000-0000-0000-00000000000b'
\set caixa_a 'aaaa7777-0000-0000-0000-00000000000a'
\set caixa_b 'bbbb7777-0000-0000-0000-00000000000b'
\set venda_a 'aaaa8888-0000-0000-0000-00000000000a'
\set venda_b 'bbbb8888-0000-0000-0000-00000000000b'
\set item_a  'aaaa9999-0000-0000-0000-00000000000a'
\set item_b  'bbbb9999-0000-0000-0000-00000000000b'
\set conv_a  'aaaaaaa1-0000-0000-0000-00000000000a'
\set conv_b  'bbbbbbb1-0000-0000-0000-00000000000b'
\set pac_a   'aaaaaaa2-0000-0000-0000-00000000000a'
\set pac_b   'bbbbbbb2-0000-0000-0000-00000000000b'

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  (:'dono_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'op.dono.a@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'op.dono.b@teste.local', '', now(), now(), now());

insert into salons (id, nome) values (:'salao_a', 'Operacao A'), (:'salao_b', 'Operacao B');
insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'), (:'dono_b', :'salao_b', 'owner');

insert into professionals (id, salon_id, nome) values
  (:'prof_a', :'salao_a', 'Prof A'), (:'prof_b', :'salao_b', 'Prof B');
insert into clients (id, salon_id, nome, telefone) values
  (:'cli_a', :'salao_a', 'Cliente A', '41988880001'),
  (:'cli_b', :'salao_b', 'Cliente B', '41988880002');
insert into services (id, salon_id, nome, duracao_minutos, preco) values
  (:'serv_a', :'salao_a', 'Corte A', 30, 50), (:'serv_b', :'salao_b', 'Corte B', 30, 50);
insert into products (id, salon_id, nome, preco_venda, estoque_atual, estoque_minimo, ativo) values
  (:'prod_a', :'salao_a', 'Pomada A', 30, 10, 2, true),
  (:'prod_b', :'salao_b', 'Pomada B', 30, 10, 2, true);

insert into cash_registers (id, salon_id) values (:'caixa_a', :'salao_a'), (:'caixa_b', :'salao_b');

insert into orders (id, salon_id, cash_register_id, client_id, professional_id, status) values
  (:'venda_a', :'salao_a', :'caixa_a', :'cli_a', :'prof_a', 'fechada'),
  (:'venda_b', :'salao_b', :'caixa_b', :'cli_b', :'prof_b', 'fechada');

insert into order_items (id, order_id, tipo, service_id, professional_id, quantidade, preco_unitario) values
  (:'item_a', :'venda_a', 'servico', :'serv_a', :'prof_a', 1, 50),
  (:'item_b', :'venda_b', 'servico', :'serv_b', :'prof_b', 1, 50);

insert into payments (order_id, forma_pagamento, valor) values
  (:'venda_a', 'pix', 50), (:'venda_b', 'pix', 50);

insert into commissions (professional_id, order_item_id, percentual_aplicado, valor_calculado) values
  (:'prof_a', :'item_a', 50, 25), (:'prof_b', :'item_b', 50, 25);

-- Horários distantes entre si: as duas EXCLUDE (barbeiro e cliente) e a folga
-- são invariantes reais e não é isto que este arquivo está testando.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status) values
  (:'salao_a', :'cli_a', :'prof_a', :'serv_a', now() + interval '2 days', now() + interval '2 days 30 min', 'agendado'),
  (:'salao_b', :'cli_b', :'prof_b', :'serv_b', now() + interval '5 days', now() + interval '5 days 30 min', 'agendado');

insert into whatsapp_conversations (id, salon_id, contact_phone) values
  (:'conv_a', :'salao_a', '41988880001'), (:'conv_b', :'salao_b', '41988880002');
insert into whatsapp_messages (conversation_id, direction, content) values
  (:'conv_a', 'in', 'oi do A'), (:'conv_b', 'in', 'oi do B');

insert into stock_movements (product_id, tipo, quantidade) values
  (:'prod_a', 'entrada', 10), (:'prod_b', 'entrada', 10);

insert into pacotes (id, salon_id, nome, preco) values
  (:'pac_a', :'salao_a', 'Pacote A', 200), (:'pac_b', :'salao_b', 'Pacote B', 200);
insert into pacotes_do_cliente (salon_id, client_id, pacote_id, order_id, preco_pago) values
  (:'salao_a', :'cli_a', :'pac_a', :'venda_a', 200),
  (:'salao_b', :'cli_b', :'pac_b', :'venda_b', 200);

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.sair() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- LEITURA — o dono do A enxerga exatamente o que é dele, e nada além.
--
-- Contar 1 é mais forte que contar 0 do outro salão: prova que a policy está
-- filtrando, e não que a tabela está simplesmente vazia ou inacessível.
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'dono_a');

select is((select count(*) from appointments)::int, 1, 'dono A enxerga 1 agendamento — o dele');
select is((select count(*) from orders)::int, 1, 'dono A enxerga 1 venda — a dele');
select is((select count(*) from cash_registers)::int, 1, 'dono A enxerga 1 caixa — o dele');
select is((select count(*) from professionals)::int, 1, 'dono A enxerga 1 profissional — o dele');
select is((select count(*) from products)::int, 1, 'dono A enxerga 1 produto — o dele');
select is((select count(*) from whatsapp_conversations)::int, 1, 'dono A enxerga 1 conversa — a dele');
select is((select count(*) from pacotes)::int, 1, 'dono A enxerga 1 pacote — o dele');
select is((select count(*) from pacotes_do_cliente)::int, 1, 'dono A enxerga 1 pacote vendido — o dele');

-- As cinco sem `salon_id`: o isolamento depende do join ao pai.
select is((select count(*) from order_items)::int, 1, 'SEM salon_id: dono A enxerga 1 item de venda');
select is((select count(*) from payments)::int, 1, 'SEM salon_id: dono A enxerga 1 pagamento');
select is((select count(*) from commissions)::int, 1, 'SEM salon_id: dono A enxerga 1 comissao');
select is((select count(*) from stock_movements)::int, 1, 'SEM salon_id: dono A enxerga 1 movimento de estoque');
select is((select count(*) from whatsapp_messages)::int, 1, 'SEM salon_id: dono A enxerga 1 mensagem');

-- ---------------------------------------------------------------------------
-- ESCRITA CRUZADA — tem que ser BARRADA, não aceita em silêncio.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into orders (salon_id, status) values ('bbbb1111-1111-1111-1111-111111111111', 'aberta')$$,
  '42501', null, 'dono A nao abre venda no salao B');

select throws_ok(
  $$insert into order_items (order_id, tipo, quantidade, preco_unitario)
    values ('bbbb8888-0000-0000-0000-00000000000b', 'produto', 1, 10)$$,
  '42501', null, 'dono A nao acrescenta item na venda do B');

select throws_ok(
  $$insert into payments (order_id, forma_pagamento, valor)
    values ('bbbb8888-0000-0000-0000-00000000000b', 'dinheiro', 999)$$,
  '42501', null, 'dono A nao lanca pagamento na venda do B');

select throws_ok(
  $$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, data_hora_fim)
    values ('bbbb1111-1111-1111-1111-111111111111', 'bbbb4444-0000-0000-0000-00000000000b',
            'bbbb3333-0000-0000-0000-00000000000b', 'bbbb5555-0000-0000-0000-00000000000b',
            now() + interval '9 days', now() + interval '9 days 30 min')$$,
  '42501', null, 'dono A nao marca horario na agenda do B');

select throws_ok(
  $$insert into whatsapp_messages (conversation_id, direction, content)
    values ('bbbbbbb1-0000-0000-0000-00000000000b', 'out', 'mensagem plantada')$$,
  '42501', null, 'dono A nao escreve na conversa do B');

-- UPDATE cruzado não erra: simplesmente não encontra linha. O que importa é
-- que o dado do B siga intacto depois.
select lives_ok(
  $$update payments set valor = 1 where valor = 50$$,
  'update cruzado em pagamentos nao levanta erro');

select pg_temp.sair();

select is(
  (select count(*) from payments p join orders o on o.id = p.order_id
    where o.salon_id = 'bbbb1111-1111-1111-1111-111111111111' and p.valor = 50)::int,
  1, 'o pagamento do salao B sobreviveu ao update cruzado');

-- ---------------------------------------------------------------------------
-- O ESPELHO — se o B enxergasse zero, o teste acima passaria por acidente.
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'dono_b');

select is((select count(*) from payments)::int, 1, 'dono B enxerga 1 pagamento — o dele');
select is((select salon_id from orders limit 1), :'salao_b'::uuid, 'a unica venda visivel ao dono B e do salao B');

select pg_temp.sair();

select * from finish();
rollback;
