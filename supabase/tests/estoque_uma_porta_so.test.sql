-- Estoque com uma porta só (migration 0137, passo 4.4).
--
-- A tela não escreve mais `estoque_atual`: toda entrada é movimento, o
-- trigger da 0109 aplica, e a soma dos movimentos é sempre o saldo.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao   'abcd9000-0000-0000-0000-00000000000a'
\set dono    'abcd9111-0000-0000-0000-00000000000a'
\set pomada  'abcd9333-0000-0000-0000-00000000000a'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono@teste.local', '', now(), now(), now());
insert into salons (id, nome) values (:'salao', 'Barbearia do Estoque');
insert into user_salons (user_id, salon_id, role) values (:'dono', :'salao', 'owner');

-- Produto cadastrado pela operação (postgres): nasce com saldo 0.
insert into products (id, salon_id, nome, preco_venda) values (:'pomada', :'salao', 'Pomada', 30);

create temp table resultado (chave text, valor text);
grant all on resultado to authenticated;

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare v_id uuid;
begin
  perform pg_temp.entrar_como('abcd9111-0000-0000-0000-00000000000a');   -- dono

  -- Cadastro que tenta gravar o saldo direto: a porta está fechada.
  begin
    insert into public.products (salon_id, nome, preco_venda, estoque_atual)
    values ('abcd9000-0000-0000-0000-00000000000a', 'Cera', 25, 5);
    insert into resultado values ('insert_com_saldo', 'PASSOU');
  exception when others then insert into resultado values ('insert_com_saldo', sqlstate); end;

  -- Cadastro sem o saldo: passa, e o saldo nasce zero.
  insert into public.products (salon_id, nome, preco_venda, estoque_minimo)
  values ('abcd9000-0000-0000-0000-00000000000a', 'Cera', 25, 2)
  returning id into v_id;
  insert into resultado values ('cera_id', v_id::text);

  -- Estoque inicial e reposição entram como movimento; o trigger aplica.
  insert into public.stock_movements (product_id, tipo, quantidade, motivo)
  values (v_id, 'entrada', 5, 'estoque inicial');
  insert into public.stock_movements (product_id, tipo, quantidade, motivo)
  values (v_id, 'saida', 2, 'ajuste manual');

  -- Editar o saldo direto: porta fechada. Editar o nome: aberta.
  begin
    update public.products set estoque_atual = 99 where id = v_id;
    insert into resultado values ('update_saldo', 'PASSOU');
  exception when others then insert into resultado values ('update_saldo', sqlstate); end;
  begin
    update public.products set nome = 'Cera Forte', estoque_minimo = 3 where id = v_id;
    insert into resultado values ('update_nome', 'PASSOU');
  exception when others then insert into resultado values ('update_nome', sqlstate); end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select is((select valor from resultado where chave = 'insert_com_saldo'), '42501',
  'cadastro que escreve estoque_atual direto e recusado');

select is(
  (select estoque_atual from products where id = (select valor::uuid from resultado where chave = 'cera_id')),
  3,
  'entrada 5 e saida 2 pelo movimento deixam o saldo em 3');

select is((select valor from resultado where chave = 'update_saldo'), '42501',
  'update de estoque_atual pela tela e recusado');

select is((select valor from resultado where chave = 'update_nome'), 'PASSOU',
  'as outras colunas continuam editaveis');

select is(
  (select nome from products where id = (select valor::uuid from resultado where chave = 'cera_id')),
  'Cera Forte',
  'o update de nome valeu');

select is(
  (select diferenca::int from estoque_conferido where product_id = (select valor::uuid from resultado where chave = 'cera_id')),
  0,
  'a soma dos movimentos e exatamente o saldo');

select is(
  (select diferenca::int from estoque_conferido where product_id = :'pomada'),
  0,
  'produto sem movimento nenhum tambem confere (0 = 0)');

select is(
  (select count(*)::int from estoque_conferido where diferenca <> 0),
  0,
  'nenhum produto com saldo diferente da soma dos movimentos');

select * from finish();
rollback;
