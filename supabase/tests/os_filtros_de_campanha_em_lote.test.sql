-- Os filtros de campanha em lote (migration 0175).
--
-- `metricas_para_filtros` é a irmã em lote da 0174: uma linha por cliente,
-- DEFINER para o número não depender de quem abriu a lista. O que se prende:
--   · os números exatos de um histórico conhecido, pacote incluso
--     (`pacote_vence_em_dias` calculado no servidor, fuso de SP);
--   · barbeiro vê os MESMOS números que o dono;
--   · cliente sem histórico vem na lista com nulls/zeros, nunca some;
--   · salão que não é do usuário devolve LINHA NENHUMA;
--   · anon não executa.
--
-- Fixtures no relógio de São Paulo (a lição do teste noturno).
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('d0750000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dono.m175@teste.local','',now(),now(),now()),
  ('d0750000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','barb.m175@teste.local','',now(),now(),now()),
  ('d0750000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fora.m175@teste.local','',now(),now(),now());
insert into salons (id, nome) values ('e0750000-0000-0000-0000-000000000001','Filtros'),('e0750000-0000-0000-0000-000000000002','Outro');
insert into user_salons (user_id, salon_id, role) values
  ('d0750000-0000-0000-0000-000000000001','e0750000-0000-0000-0000-000000000001','owner'),
  ('d0750000-0000-0000-0000-000000000002','e0750000-0000-0000-0000-000000000001','barbeiro'),
  ('d0750000-0000-0000-0000-000000000003','e0750000-0000-0000-0000-000000000002','owner');
insert into professionals (id, salon_id, nome, ativo, user_id) values
  ('e0750000-0000-0000-0000-000000000011','e0750000-0000-0000-0000-000000000001','Dono',true,'d0750000-0000-0000-0000-000000000001'),
  ('e0750000-0000-0000-0000-000000000012','e0750000-0000-0000-0000-000000000001','Barb',true,'d0750000-0000-0000-0000-000000000002');
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  ('e0750000-0000-0000-0000-000000000021','e0750000-0000-0000-0000-000000000001','Corte',40,50,true);
insert into products (id, salon_id, nome, preco_venda, estoque_atual, ativo) values
  ('e0750000-0000-0000-0000-000000000023','e0750000-0000-0000-0000-000000000001','Pomada',25,10,true);
insert into clients (id, salon_id, nome, telefone) values
  ('c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000001','Fulano','41999990001'),
  ('c0750000-0000-0000-0000-000000000032','e0750000-0000-0000-0000-000000000001','Novo','41999990002');
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem) values
  ('a0750000-0000-0000-0000-000000000001','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000011','e0750000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 40) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm'),
  ('a0750000-0000-0000-0000-000000000002','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000012','e0750000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 30) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm'),
  ('a0750000-0000-0000-0000-000000000003','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000012','e0750000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 10) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm');
insert into orders (id, salon_id, client_id, professional_id, status, closed_at) values
  ('b0750000-0000-0000-0000-000000000001','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000011','fechada',now() - interval '30 days'),
  ('b0750000-0000-0000-0000-000000000002','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','e0750000-0000-0000-0000-000000000012','fechada',now() - interval '10 days');
insert into order_items (order_id, tipo, service_id, product_id, professional_id, quantidade, preco_unitario) values
  ('b0750000-0000-0000-0000-000000000001','servico','e0750000-0000-0000-0000-000000000021',null,'e0750000-0000-0000-0000-000000000011',1,50),
  ('b0750000-0000-0000-0000-000000000002','produto',null,'e0750000-0000-0000-0000-000000000023','e0750000-0000-0000-0000-000000000012',1,25);
insert into pacotes (id, salon_id, nome, preco, ativo) values
  ('f0750000-0000-0000-0000-000000000001','e0750000-0000-0000-0000-000000000001','5 cortes',180,true);
insert into pacote_itens (pacote_id, service_id, quantidade) values
  ('f0750000-0000-0000-0000-000000000001','e0750000-0000-0000-0000-000000000021',5);
insert into pacotes_do_cliente (id, salon_id, client_id, pacote_id, order_id, preco_pago, expira_em) values
  ('f0750000-0000-0000-0000-000000000002','e0750000-0000-0000-0000-000000000001','c0750000-0000-0000-0000-000000000031','f0750000-0000-0000-0000-000000000001','b0750000-0000-0000-0000-000000000002',180,(now() at time zone 'America/Sao_Paulo')::date + 10);

create or replace function pg_temp.entrar_como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end; $$;
create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

-- ── O dono, nos números exatos ─────────────────────────────────────────────
select pg_temp.entrar_como('d0750000-0000-0000-0000-000000000001');

select is(
  (select (dias_desde_ultima, intervalo_mediano_dias, comprou_produto, fechadas)::text
     from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')
    where client_id = 'c0750000-0000-0000-0000-000000000031'),
  '(10,15,t,2)',
  'ritmo e compras do Fulano: 10 dias, mediana 15, levou produto, 2 comandas');

select is(
  (select (pacote_restante, pacote_vence_em_dias)::text
     from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')
    where client_id = 'c0750000-0000-0000-0000-000000000031'),
  '(5,10)',
  'pacote: 5 restantes, vence em 10 dias -- calculado no servidor, fuso de SP');

select is(
  (select (dias_desde_ultima is null and intervalo_mediano_dias is null
           and not comprou_produto and fechadas = 0 and pacote_restante = 0
           and pacote_vence_em_dias is null)
     from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')
    where client_id = 'c0750000-0000-0000-0000-000000000032'),
  true,
  'cliente novo VEM NA LISTA, com nulls e zeros -- filtro nenhum o esconde por engano');

select is(
  (select count(*)::int from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')),
  2,
  'uma linha por cliente do salao');

-- ── O barbeiro vê os MESMOS números ────────────────────────────────────────
select pg_temp.entrar_como('d0750000-0000-0000-0000-000000000002');

select is(
  (select (dias_desde_ultima, fechadas, pacote_restante)::text
     from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')
    where client_id = 'c0750000-0000-0000-0000-000000000031'),
  '(10,2,5)',
  'BARBEIRO ve os mesmos numeros do dono -- filtro de campanha nao pode depender de quem abriu a lista');

select is(
  (select count(*)::int from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')),
  2,
  'barbeiro ve a lista inteira do salao');

-- ── Fora do salão: nada ────────────────────────────────────────────────────
select pg_temp.entrar_como('d0750000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from metricas_para_filtros('e0750000-0000-0000-0000-000000000001')),
  0,
  'salao que nao e do usuario devolve linha NENHUMA');
select is(
  (select count(*)::int from metricas_para_filtros('e0750000-0000-0000-0000-000000000002')),
  0,
  'salao proprio mas vazio devolve zero linhas sem erro');

-- ── O trinco ───────────────────────────────────────────────────────────────
select pg_temp.sair();
select ok(
  not has_function_privilege('anon', 'public.metricas_para_filtros(uuid)', 'execute'),
  'anon nao executa a funcao');

select * from finish();
rollback;
