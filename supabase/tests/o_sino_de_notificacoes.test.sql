-- O sino de notificações (migration 0173).
--
-- `notificacoes_do_salao` é o que o sino do CRM lê: o que aconteceu SEM a
-- barbearia fazer nada, nos últimos 7 dias. Se ela mentir, o dono perde o que
-- chegou enquanto cortava cabelo — que é exatamente o buraco que o sino veio
-- tapar (o cartão de "novo agendamento" vive 15 segundos).
--
-- O que se prende aqui:
--   · o que o dono fez ele mesmo (origem crm) NÃO vira notificação;
--   · cancelamento pela barbearia NÃO vira "cancelou" (só o do cliente);
--   · o barbeiro vê só os horários DELE (a RLS de appointments atravessa a view);
--   · `notificacoes_vistas` é de cada um: o gerente ler não zera o sino do dono;
--   · E O TRINCO: view e tabela recriadas no `public` nascem legíveis por
--     `anon` (lição da 0171) — sem o revoke, a agenda de qualquer barbearia
--     sai por REST.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(12);

\set salao 'e0510000-0000-0000-0000-000000000001'
\set dono  'd0510000-0000-0000-0000-000000000001'
\set barb  'd0510000-0000-0000-0000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.sino@teste.local', '', now(), now(), now()),
  (:'barb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barb.sino@teste.local', '', now(), now(), now());

insert into salons (id, nome) values (:'salao', 'Sino');
insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'salao', 'owner'),
  (:'barb', :'salao', 'barbeiro');
insert into professionals (id, salon_id, nome, ativo, user_id) values
  ('e0510000-0000-0000-0000-000000000011', :'salao', 'Dono', true, :'dono'),
  ('e0510000-0000-0000-0000-000000000012', :'salao', 'Barb', true, :'barb');
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  ('e0510000-0000-0000-0000-000000000021', :'salao', 'Corte', 40, 45, true),
  ('e0510000-0000-0000-0000-000000000022', :'salao', 'Barba', 30, 30, true);
insert into clients (id, salon_id, nome, telefone) values
  ('e0510000-0000-0000-0000-000000000031', :'salao', 'Fulano', '41999990000');

-- a1 CRM (fora) · a2 público 2 serviços (novo) · a3 agente cancelado pelo
-- cliente, cadeira do BARBEIRO (novo+cancelou) · a4 público remarcado
-- (novo+remarcou) · a5 público cancelado pela BARBEARIA (só novo) · a6 velho
-- de 10 dias (fora).
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem, created_at) values
  ('a0510000-0000-0000-0000-000000000001', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000011', 'e0510000-0000-0000-0000-000000000021', ((current_date+1)+time '09:00') at time zone 'America/Sao_Paulo', 'agendado', 'crm', now()),
  ('a0510000-0000-0000-0000-000000000002', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000011', 'e0510000-0000-0000-0000-000000000021', ((current_date+1)+time '10:00') at time zone 'America/Sao_Paulo', 'agendado', 'publico', now()),
  ('a0510000-0000-0000-0000-000000000003', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000012', 'e0510000-0000-0000-0000-000000000021', ((current_date+1)+time '12:00') at time zone 'America/Sao_Paulo', 'agendado', 'agente', now()),
  ('a0510000-0000-0000-0000-000000000004', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000011', 'e0510000-0000-0000-0000-000000000021', ((current_date+1)+time '14:00') at time zone 'America/Sao_Paulo', 'agendado', 'publico', now()),
  ('a0510000-0000-0000-0000-000000000005', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000011', 'e0510000-0000-0000-0000-000000000021', ((current_date+1)+time '16:00') at time zone 'America/Sao_Paulo', 'agendado', 'publico', now()),
  ('a0510000-0000-0000-0000-000000000006', :'salao', 'e0510000-0000-0000-0000-000000000031', 'e0510000-0000-0000-0000-000000000011', 'e0510000-0000-0000-0000-000000000021', ((current_date+2)+time '09:00') at time zone 'America/Sao_Paulo', 'agendado', 'publico', now() - interval '10 days');

-- O gatilho já espelhou o principal (ordem 1); só a barba entra à mão.
insert into appointment_services (appointment_id, service_id, ordem) values
  ('a0510000-0000-0000-0000-000000000002', 'e0510000-0000-0000-0000-000000000022', 2);

update appointments set status='cancelado', cancelado_por='cliente', cancelado_em=now()
 where id='a0510000-0000-0000-0000-000000000003';
update appointments set remarcado_pelo_cliente_em=now()
 where id='a0510000-0000-0000-0000-000000000004';
update appointments set status='cancelado', cancelado_por='barbearia', cancelado_em=now()
 where id='a0510000-0000-0000-0000-000000000005';

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

-- ── O dono vê o salão inteiro ──────────────────────────────────────────────
select pg_temp.entrar_como(:'dono');

select is(
  (select count(*)::int from notificacoes_do_salao),
  6,
  'dono ve 6 eventos: 4 novos + 1 cancelou + 1 remarcou -- o que ele mesmo criou (crm) e o velho de 10 dias ficam fora'
);

select is(
  (select servicos from notificacoes_do_salao
    where chave = 'novo_horario:a0510000-0000-0000-0000-000000000002'),
  'Corte + Barba',
  'os servicos vem somados, como na 0171 -- "Barba" sozinho para um corte+barba e o defeito que ja aconteceu'
);

select is(
  (select count(*)::int from notificacoes_do_salao where tipo = 'cancelou'),
  1,
  'so o cancelamento DO CLIENTE vira "cancelou" -- o da barbearia nao e noticia para ela mesma'
);

select is(
  (select count(*)::int from notificacoes_do_salao where tipo = 'remarcou'),
  1,
  'remarcacao do cliente vira "remarcou"'
);

select is(
  (select count(*)::int from notificacoes_do_salao where chave like '%a0510000-0000-0000-0000-000000000001'),
  0,
  'o que o dono marcou pelo CRM nao notifica ninguem'
);

-- ── O barbeiro vê só os horários dele ──────────────────────────────────────
select pg_temp.entrar_como(:'barb');

select is(
  (select count(*)::int from notificacoes_do_salao),
  2,
  'barbeiro ve 2 (novo + cancelou do horario DELE) -- a RLS de appointments atravessa a view por causa do invoker'
);

-- ── O "visto" é de cada um ─────────────────────────────────────────────────
insert into notificacoes_vistas (user_id, salon_id) values (:'barb', :'salao');

select pg_temp.entrar_como(:'dono');

select is(
  (select count(*)::int from notificacoes_vistas),
  0,
  'o dono NAO ve a linha de visto do barbeiro: o sino de um nao zera o do outro'
);

select throws_ok(
  $$ insert into notificacoes_vistas (user_id, salon_id)
     values ('d0510000-0000-0000-0000-000000000002', 'e0510000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'gravar visto NO NOME de outra pessoa e barrado pela policy'
);

insert into notificacoes_vistas (user_id, salon_id) values (:'dono', :'salao');
select is(
  (select count(*)::int from notificacoes_vistas),
  1,
  'cada um le exatamente a propria linha'
);

-- ── O trinco ───────────────────────────────────────────────────────────────
select pg_temp.sair();

select ok(
  not has_table_privilege('anon', 'public.notificacoes_do_salao', 'select'),
  'anon nao le a view -- view nova no public nasce aberta para anon (licao da 0171), e sem o revoke a agenda sai por REST'
);

select ok(
  not has_table_privilege('anon', 'public.notificacoes_vistas', 'select')
  and not has_table_privilege('anon', 'public.notificacoes_vistas', 'insert'),
  'anon nao le nem escreve as vistas'
);

select ok(
  (select relrowsecurity from pg_class where relname = 'notificacoes_vistas'),
  'notificacoes_vistas esta com RLS ligada -- e a catraca tabelas_com_rls a cobre daqui em diante'
);

select * from finish();
rollback;
