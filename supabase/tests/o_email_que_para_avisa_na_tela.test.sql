-- O e-mail que para avisa na tela (migration 0181).
--
-- Em 20/09 a caixa de e-mail caiu e ficou QUATRO DIAS em silêncio: os nós do
-- n8n têm saída de erro e fecham como "sucesso", e o alarme por e-mail seria
-- circular. `entregas_presas` é o termômetro que a faixa do CRM lê — e o que
-- se prende aqui é justamente o que torna um alarme confiável:
--
--   · a TOLERÂNCIA existe (item recente não conta), senão o alarme dispara no
--     atraso normal do agendador e vira ruído que se aprende a ignorar;
--   · o que já não precisa de e-mail fica de fora (convite aceito pelo link
--     copiado, convite vencido), senão o alarme nunca se apaga;
--   · a autorização é POR SALÃO: fila de outra barbearia não é assunto de
--     quem está logado nesta.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(10);

\set dono   'ee018100-0000-0000-0000-000000000001'
\set outro  'ee018100-0000-0000-0000-000000000002'
\set salao  'ee018101-0000-0000-0000-000000000001'
\set alheio 'ee018101-0000-0000-0000-000000000002'

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

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at) values
  (:'dono',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono0181@teste.local',  '', now(), now(), now()),
  (:'outro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outro0181@teste.local', '', now(), now(), now());
insert into salons (id, nome, ativo) values
  (:'salao', 'Fila Limpa', true),
  (:'alheio', 'Barbearia Alheia', true);
insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'salao', 'owner'),
  (:'outro', :'alheio', 'owner');

-- ── Fila limpa ──────────────────────────────────────────────────────────────

select pg_temp.entrar_como(:'dono');
select is(
  (entregas_presas(:'salao')->>'presas')::int, 0,
  'sem nada na fila, o alarme fica calado');
select pg_temp.sair();

-- ── A tolerância de 20 minutos ──────────────────────────────────────────────

insert into feedbacks (salon_id, user_id, tipo, mensagem, created_at) values
  (:'salao', :'dono', 'problema', 'preso ha 25 min', now() - interval '25 minutes'),
  (:'salao', :'dono', 'problema', 'acabou de entrar', now() - interval '5 minutes');

select pg_temp.entrar_como(:'dono');
select is(
  (entregas_presas(:'salao')->>'presas')::int, 1,
  'o feedback de 25 min conta e o de 5 min nao: a tolerancia existe');
select is(
  (entregas_presas(:'salao')->>'feedbacks')::int, 1,
  'e ele aparece separado por fila');
select ok(
  (entregas_presas(:'salao')->>'desde') is not null,
  'o "desde quando" vem junto, que e a pergunta seguinte do dono');
select pg_temp.sair();

-- ── O que ja nao precisa de e-mail fica de fora ─────────────────────────────

insert into salon_invites (salon_id, token, nome, email, role, criado_por, expira_em, created_at, usado_em) values
  (:'salao', gen_random_uuid()::text, 'Preso',   'p@teste.local', 'barbeiro', :'dono',
   now() + interval '7 days', now() - interval '30 minutes', null),
  -- Aceito pelo LINK copiado na tela: o e-mail perdeu a razao de existir.
  (:'salao', gen_random_uuid()::text, 'Usado',   'u@teste.local', 'barbeiro', :'dono',
   now() + interval '7 days', now() - interval '30 minutes', now()),
  (:'salao', gen_random_uuid()::text, 'Vencido', 'v@teste.local', 'barbeiro', :'dono',
   now() - interval '1 day', now() - interval '30 minutes', null);

select pg_temp.entrar_como(:'dono');
select is(
  (entregas_presas(:'salao')->>'presas')::int, 2,
  'convite preso entra; o aceito pelo link e o vencido nao');
select is(
  (entregas_presas(:'salao')->>'convites')::int, 1,
  'so um convite conta como preso');
select pg_temp.sair();

-- ── Isolamento entre barbearias ─────────────────────────────────────────────

select pg_temp.entrar_como(:'outro');
select ok(
  entregas_presas(:'salao') is null,
  'a fila de outra barbearia nao e assunto de quem esta logado nesta');
select pg_temp.sair();

-- ── O trinco ────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.entregas_presas(uuid)', 'execute'),
  'anon nao executa entregas_presas');
select ok(
  has_function_privilege('authenticated', 'public.entregas_presas(uuid)', 'execute'),
  'o dono logado executa (e a faixa do CRM depende disso)');

select * from finish();
rollback;
