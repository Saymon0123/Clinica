-- As métricas do cliente que disparam campanha (migration 0174).
--
-- `metricas_do_cliente` é DEFINER de propósito: a RLS de `appointments`
-- mostra ao barbeiro só os horários dele, e métrica enviesada dispara
-- campanha errada ("sumiu há 40 dias" para quem veio há 3 com outro
-- barbeiro). O que se prende aqui:
--   · os números exatos de um histórico conhecido (fuso de SP, mediana,
--     ticket sem dividir por zero);
--   · BARBEIRO vê os MESMOS números que o dono — o ponto inteiro do definer;
--   · cliente sem histórico devolve UMA linha de nulls, nunca NaN nem erro;
--   · usuário de outro salão recebe LINHA NENHUMA — nem "existe";
--   · anon não executa.
--
-- Fixtures no relógio de São Paulo (a lição do teste que só falhava à
-- noite): as datas nascem de (now() at time zone SP)::date, nunca de
-- current_date do runner.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('d0740000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dono.m174@teste.local','',now(),now(),now()),
  ('d0740000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','barb.m174@teste.local','',now(),now(),now()),
  ('d0740000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fora.m174@teste.local','',now(),now(),now());
insert into salons (id, nome) values
  ('e0740000-0000-0000-0000-000000000001','Metricas'),
  ('e0740000-0000-0000-0000-000000000002','Outro');
insert into user_salons (user_id, salon_id, role) values
  ('d0740000-0000-0000-0000-000000000001','e0740000-0000-0000-0000-000000000001','owner'),
  ('d0740000-0000-0000-0000-000000000002','e0740000-0000-0000-0000-000000000001','barbeiro'),
  ('d0740000-0000-0000-0000-000000000003','e0740000-0000-0000-0000-000000000002','owner');
insert into professionals (id, salon_id, nome, ativo, user_id) values
  ('e0740000-0000-0000-0000-000000000011','e0740000-0000-0000-0000-000000000001','Dono',true,'d0740000-0000-0000-0000-000000000001'),
  ('e0740000-0000-0000-0000-000000000012','e0740000-0000-0000-0000-000000000001','Barb',true,'d0740000-0000-0000-0000-000000000002');
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  ('e0740000-0000-0000-0000-000000000021','e0740000-0000-0000-0000-000000000001','Corte',40,50,true),
  ('e0740000-0000-0000-0000-000000000022','e0740000-0000-0000-0000-000000000001','Barba',30,30,true);
insert into products (id, salon_id, nome, preco_venda, estoque_atual, ativo) values
  ('e0740000-0000-0000-0000-000000000023','e0740000-0000-0000-0000-000000000001','Pomada',25,10,true);
insert into clients (id, salon_id, nome, telefone) values
  ('c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000001','Fulano','41999990001'),
  ('c0740000-0000-0000-0000-000000000032','e0740000-0000-0000-0000-000000000001','Novo','41999990002');

-- Concluídos há 40, 30 e 10 dias (intervalos 10 e 20 → mediana 15), metade
-- com o DONO e metade com o BARBEIRO — é o recorte que o definer nivela.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem) values
  ('a0740000-0000-0000-0000-000000000001','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000011','e0740000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 40) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm'),
  ('a0740000-0000-0000-0000-000000000002','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000012','e0740000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 30) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm'),
  ('a0740000-0000-0000-0000-000000000003','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000012','e0740000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 10) + time '10:00') at time zone 'America/Sao_Paulo','concluido','crm'),
  ('a0740000-0000-0000-0000-000000000004','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000011','e0740000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 5) + time '11:00') at time zone 'America/Sao_Paulo','faltou','crm'),
  ('a0740000-0000-0000-0000-000000000005','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000011','e0740000-0000-0000-0000-000000000021',(((now() at time zone 'America/Sao_Paulo')::date - 3) + time '11:00') at time zone 'America/Sao_Paulo','cancelado','publico');
update appointments set cancelado_por='cliente', cancelado_em=now() where id='a0740000-0000-0000-0000-000000000005';

-- Comandas de R$80 e R$50 → ticket 65. Corte 2x, Barba 1x, e um produto.
insert into orders (id, salon_id, client_id, professional_id, status, closed_at) values
  ('b0740000-0000-0000-0000-000000000001','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000011','fechada',now() - interval '30 days'),
  ('b0740000-0000-0000-0000-000000000002','e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031','e0740000-0000-0000-0000-000000000012','fechada',now() - interval '10 days');
insert into order_items (order_id, tipo, service_id, product_id, professional_id, quantidade, preco_unitario) values
  ('b0740000-0000-0000-0000-000000000001','servico','e0740000-0000-0000-0000-000000000021',null,'e0740000-0000-0000-0000-000000000011',1,50),
  ('b0740000-0000-0000-0000-000000000001','servico','e0740000-0000-0000-0000-000000000022',null,'e0740000-0000-0000-0000-000000000011',1,30),
  ('b0740000-0000-0000-0000-000000000002','servico','e0740000-0000-0000-0000-000000000021',null,'e0740000-0000-0000-0000-000000000012',1,25),
  ('b0740000-0000-0000-0000-000000000002','produto',null,'e0740000-0000-0000-0000-000000000023','e0740000-0000-0000-0000-000000000012',1,25);
insert into avaliacoes (salon_id, client_id, nota, criado_em) values
  ('e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031',4,now() - interval '9 days'),
  ('e0740000-0000-0000-0000-000000000001','c0740000-0000-0000-0000-000000000031',5,now() - interval '2 days');

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

-- ── O dono vê o histórico inteiro, nos números exatos ──────────────────────
select pg_temp.entrar_como('d0740000-0000-0000-0000-000000000001');

select is((select dias_desde_ultima from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 10,
  'ultima visita ha 10 dias, contados no fuso de Sao Paulo');
select is((select concluidos from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 3,
  'tres atendimentos concluidos');
select is((select intervalo_mediano_dias from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 15,
  'mediana dos intervalos (10 e 20 dias) = 15');
select is((select ticket_medio from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 65.00,
  'ticket medio por comanda (80 e 50) = 65');
select is((select servico_top from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 'Corte',
  'servico de sempre e o mais consumido nas comandas');
select is((select comprou_produto from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), true,
  'ja levou produto');
select is((select faltas from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 1,
  'uma falta');
select is((select cancelamentos_dele from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 1,
  'um cancelamento DELE (cancelado_por = cliente)');
select is((select ultima_nota from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 5,
  'a nota e a MAIS RECENTE (5), nao a maior nem a media');

-- ── O barbeiro vê os MESMOS números — o ponto inteiro do definer ───────────
select pg_temp.entrar_como('d0740000-0000-0000-0000-000000000002');

select is((select dias_desde_ultima from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 10,
  'BARBEIRO ve os mesmos 10 dias -- a RLS de appointments mostraria so os horarios dele e enviesaria a campanha');
select is((select concluidos from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 3,
  'barbeiro conta os 3 concluidos, nao so os 2 da cadeira dele');

-- ── Cliente sem histórico: uma linha de nulls, nunca erro ──────────────────
select is(
  (select (ultima_visita is null and intervalo_mediano_dias is null and ticket_medio is null
           and servico_top is null and not comprou_produto and concluidos = 0)
     from metricas_do_cliente('c0740000-0000-0000-0000-000000000032')),
  true,
  'cliente novo devolve UMA linha de nulls -- a ficha mostra travessao, nunca NaN');

-- ── Fora do salão: linha nenhuma ───────────────────────────────────────────
select pg_temp.entrar_como('d0740000-0000-0000-0000-000000000003');
select is((select count(*)::int from metricas_do_cliente('c0740000-0000-0000-0000-000000000031')), 0,
  'usuario de OUTRO salao recebe linha nenhuma -- nem "existe" vaza');

-- ── O trinco ───────────────────────────────────────────────────────────────
select pg_temp.sair();
select ok(
  not has_function_privilege('anon', 'public.metricas_do_cliente(uuid)', 'execute'),
  'anon nao executa a funcao');

select * from finish();
rollback;
