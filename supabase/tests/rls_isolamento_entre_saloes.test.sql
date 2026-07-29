-- Isolamento multi-tenant: um salão nunca enxerga nem escreve dados de outro.
--
-- Este é o invariante mais caro de quebrar no sistema — as políticas foram
-- reescritas em três fases (0002, 0015, 0020) e uma regressão aqui vaza dados
-- entre clientes sem aparecer em nenhum log.
--
-- Rodar com: supabase test db

begin;
select plan(14);

create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Fixture: dois salões independentes, três usuários.
-- ---------------------------------------------------------------------------
\set salao_a '11111111-1111-1111-1111-111111111111'
\set salao_b '22222222-2222-2222-2222-222222222222'
\set dono_a  'aaaaaaaa-0000-0000-0000-000000000001'
\set barb_a  'aaaaaaaa-0000-0000-0000-000000000002'
\set dono_b  'bbbbbbbb-0000-0000-0000-000000000001'

insert into auth.users (id, email, instance_id, aud, role)
values
  (:'dono_a', 'dono.a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'barb_a', 'barbeiro.a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'dono_b', 'dono.b@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into salons (id, nome) values (:'salao_a', 'Barbearia A'), (:'salao_b', 'Barbearia B');

insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'barb_a', :'salao_a', 'barbeiro'),
  (:'dono_b', :'salao_b', 'owner');

insert into clients (id, salon_id, nome, telefone) values
  ('c0000000-0000-0000-0000-00000000000a', :'salao_a', 'Cliente do A', '41999990000'),
  ('c0000000-0000-0000-0000-00000000000b', :'salao_b', 'Cliente do B', '41999991111');

insert into services (id, salon_id, nome, duracao_minutos, preco) values
  ('50000000-0000-0000-0000-00000000000a', :'salao_a', 'Corte A', 30, 50),
  ('50000000-0000-0000-0000-00000000000b', :'salao_b', 'Corte B', 30, 50);

-- Helper: assume a identidade de um usuário autenticado.
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

create or replace function pg_temp.sair() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dono do salão A
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'dono_a');

select is(
  (select count(*) from clients)::int, 1,
  'dono A enxerga exatamente 1 cliente (o do proprio salao)'
);

select is(
  (select salon_id from clients limit 1), :'salao_a'::uuid,
  'o unico cliente visivel para o dono A pertence ao salao A'
);

select is(
  (select count(*) from clients where salon_id = :'salao_b')::int, 0,
  'dono A nao enxerga nenhum cliente do salao B'
);

select is(
  (select count(*) from salons)::int, 1,
  'dono A enxerga apenas o proprio salao'
);

select is(
  (select count(*) from services where salon_id = :'salao_b')::int, 0,
  'dono A nao enxerga o catalogo do salao B'
);

-- Escrita cruzada precisa ser barrada pelo WITH CHECK, não silenciosamente aceita.
select throws_ok(
  $$insert into clients (salon_id, nome, telefone) values ('22222222-2222-2222-2222-222222222222', 'Invasor', '41000000000')$$,
  '42501',
  null,
  'dono A nao consegue inserir cliente no salao B'
);

-- UPDATE cruzado não deve encontrar linha (a de B é invisível), logo afeta 0 linhas.
select lives_ok(
  $$update clients set nome = 'Sequestrado' where salon_id = '22222222-2222-2222-2222-222222222222'$$,
  'update cruzado nao levanta erro'
);

select pg_temp.sair();

select is(
  (select nome from clients where salon_id = :'salao_b'), 'Cliente do B',
  'o cliente do salao B permaneceu intacto apos o update cruzado'
);

-- ---------------------------------------------------------------------------
-- Dono do salão B — visão espelhada
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'dono_b');

select is(
  (select count(*) from clients)::int, 1,
  'dono B enxerga exatamente 1 cliente'
);

select is(
  (select salon_id from clients limit 1), :'salao_b'::uuid,
  'o unico cliente visivel para o dono B pertence ao salao B'
);

select pg_temp.sair();

-- ---------------------------------------------------------------------------
-- Barbeiro do salão A — escopo reduzido dentro do próprio salão
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'barb_a');

select is(
  (select count(*) from clients where salon_id = :'salao_b')::int, 0,
  'barbeiro do A nao enxerga clientes do salao B'
);

select is(
  (select count(*) from services where salon_id = :'salao_a')::int, 1,
  'barbeiro do A le o catalogo do proprio salao'
);

-- Serviço criado pelo gestor tem created_by nulo; barbeiro não pode apagar.
select lives_ok(
  $$delete from services where id = '50000000-0000-0000-0000-00000000000a'$$,
  'delete do barbeiro em servico do gestor nao levanta erro'
);

select pg_temp.sair();

select is(
  (select count(*) from services where id = '50000000-0000-0000-0000-00000000000a')::int, 1,
  'servico criado pelo gestor sobreviveu a tentativa de delete do barbeiro'
);

select * from finish();
rollback;
