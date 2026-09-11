-- Sem documento de quem paga, o teste acaba e o acesso não renova (migration
-- 0156, M2 do giro de 10/09).
--
-- Antes, sem CPF/CNPJ não havia Pix, sem Pix não havia vencimento, e sem
-- vencimento o cron renovava o acesso para sempre. Os três lados desta regra
-- custam caro se falharem: renovar sem documento é produto de graça; não
-- renovar COM documento tranca quem está em dia; e não destravar na hora em
-- que o documento chega deixa o dono trancado achando que nada foi salvo.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(17);

-- O relógio da regra é o de São Paulo (ver cadeia_de_cobranca.test.sql).
create or replace function pg_temp.hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

\set sem_doc   'cccc9000-0000-0000-0000-000000000001'
\set doc_torto 'cccc9000-0000-0000-0000-000000000002'
\set com_doc   'cccc9000-0000-0000-0000-000000000003'
\set devendo   'cccc9000-0000-0000-0000-000000000004'
\set em_teste  'cccc9000-0000-0000-0000-000000000005'
\set da_rede   'cccc9000-0000-0000-0000-000000000006'
\set rede      'cccc9000-0000-0000-0000-00000000000f'
\set dono      'cccc9111-0000-0000-0000-000000000001'
\set barbeiro  'cccc9111-0000-0000-0000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc.dono@teste.local', '', now(), now(), now()),
  (:'barbeiro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc.barbeiro@teste.local', '', now(), now(), now());

insert into organizations (id, nome) values (:'rede', 'Rede Documento');

insert into salons (id, nome, organization_id) values
  (:'sem_doc', 'Sem Documento', null),
  (:'doc_torto', 'Documento Torto', null),
  (:'com_doc', 'Com Documento', null),
  (:'devendo', 'Devendo', null),
  (:'em_teste', 'Ainda Em Teste', null),
  (:'da_rede', 'Unidade da Rede', :'rede');

insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'sem_doc', 'owner'),
  (:'dono', :'devendo', 'owner'),
  (:'dono', :'em_teste', 'owner'),
  (:'barbeiro', :'sem_doc', 'barbeiro');

-- Todas terminaram o teste ontem e estão com o acesso vencendo ontem — menos a
-- que ainda está em teste. 52998224725 é CPF válido; 12345678900, não.
insert into subscriptions (salon_id, status, acesso_ate, trial_ate, cpf_cnpj) values
  (:'sem_doc',   'trial', pg_temp.hoje() - 1, pg_temp.hoje() - 1, null),
  (:'doc_torto', 'trial', pg_temp.hoje() - 1, pg_temp.hoje() - 1, '12345678900'),
  (:'com_doc',   'trial', pg_temp.hoje() - 1, pg_temp.hoje() - 1, '52998224725'),
  (:'devendo',   'ativa', pg_temp.hoje() - 1, pg_temp.hoje() - 30, '52998224725'),
  (:'em_teste',  'trial', pg_temp.hoje() + 2, pg_temp.hoje() + 2, null),
  (:'da_rede',   'trial', pg_temp.hoje() - 1, pg_temp.hoje() - 1, null);

-- Esta deve de verdade: cobrança emitida, vencida e sem pagar.
insert into faturas_de_uso (salon_id, periodo_inicio, periodo_fim, motivo,
                            barbeiros, preco_unitario, agendamentos, lembretes, reativacoes,
                            valor, valor_gerado, detalhe, cobranca_vence_em)
values (:'devendo', date '2026-06-01', date '2026-06-30', 'mensal',
        1, 0.75, 40, 0, 0, 30, 0, '[]'::jsonb, pg_temp.hoje() - 2);

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
-- O cron da madrugada
-- ---------------------------------------------------------------------------
select lives_ok($$select estender_acesso_sem_debito()$$, 'o job diario roda sem erro');

select is((select acesso_ate from subscriptions where salon_id = :'sem_doc'), pg_temp.hoje() - 1,
  'terminou o teste sem documento: o acesso nao renova');
select is((select acesso_ate from subscriptions where salon_id = :'doc_torto'), pg_temp.hoje() - 1,
  'documento com digito errado nao conta');
select is((select acesso_ate from subscriptions where salon_id = :'com_doc'), pg_temp.hoje() + 1,
  'com documento valido, renova como antes');
select is((select acesso_ate from subscriptions where salon_id = :'devendo'), pg_temp.hoje() - 1,
  'documento nao livra quem tem cobranca vencida');
select is((select acesso_ate from subscriptions where salon_id = :'em_teste'), pg_temp.hoje() + 2,
  'quem ainda esta em teste nao e tocado');
select is((select acesso_ate from subscriptions where salon_id = :'da_rede'), pg_temp.hoje() - 1,
  'unidade de rede sem documento proprio e sem cobranca unificada: nao renova');

-- ---------------------------------------------------------------------------
-- O que a tela recebe: o motivo muda o que o dono tem de fazer
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como(:'dono');
select is(
  (select bloqueado::text || '/' || documento_ok::text || '/' || coalesce(motivo_do_bloqueio, '-')
     from situacao_do_acesso(:'sem_doc')),
  'true/false/sem_documento',
  'bloqueada por falta de documento, e a tela sabe disso');
select is(
  (select bloqueado::text || '/' || documento_ok::text || '/' || coalesce(motivo_do_bloqueio, '-')
     from situacao_do_acesso(:'em_teste')),
  'false/false/-',
  'ainda em teste e sem documento: nao bloqueia, mas a tela ja pode pedir');
select is(
  (select bloqueado::text || '/' || documento_ok::text || '/' || coalesce(motivo_do_bloqueio, '-')
     from situacao_do_acesso(:'devendo')),
  'true/true/cobranca_vencida',
  'com documento e cobranca vencida, o motivo e a cobranca');

select pg_temp.entrar_como(:'barbeiro');
select is(
  (select coalesce(motivo_do_bloqueio, '-') from situacao_do_acesso(:'sem_doc')),
  'sem_documento',
  'o barbeiro recebe o motivo -- para a tela dizer "avise o dono" -- sem ver o documento');

-- A régua e o documento não são chamáveis pela equipe: só o banco os usa.
select pg_temp.entrar_como(:'dono');
select throws_ok($$select private.estender_acesso(null)$$, '42501', null,
  'a equipe nao chama a regua de renovar direto');
select throws_ok(format($$select private.documento_de_cobranca_ok(%L)$$, :'sem_doc'), '42501', null,
  'nem a funcao que olha o documento');

-- ---------------------------------------------------------------------------
-- Cadastrar o documento destrava na hora, sem esperar o cron
-- ---------------------------------------------------------------------------
-- Pelo mesmo caminho da tela: o dono, pela policy dele, só na coluna do documento.
update subscriptions set cpf_cnpj = '52998224725' where salon_id = :'sem_doc';
select is(
  (select bloqueado::text || '/' || documento_ok::text || '/' || coalesce(motivo_do_bloqueio, '-')
     from situacao_do_acesso(:'sem_doc')),
  'false/true/-',
  'o dono salvou o CPF e a tela ja sai do bloqueio');
select pg_temp.sair();

select is((select acesso_ate from subscriptions where salon_id = :'sem_doc'), pg_temp.hoje() + 1,
  'o gatilho renovou o acesso no mesmo instante');

-- Trocar um documento inválido por outro inválido não destrava nada.
update subscriptions set cpf_cnpj = '11111111111' where salon_id = :'doc_torto';
select is((select acesso_ate from subscriptions where salon_id = :'doc_torto'), pg_temp.hoje() - 1,
  'trocar por outro documento invalido nao destrava');

-- Rede: ligar a cobrança unificada com o documento da rede destrava a unidade.
update organizations set cobranca_unificada = true, cpf_cnpj = '11222333000181' where id = :'rede';
select is((select acesso_ate from subscriptions where salon_id = :'da_rede'), pg_temp.hoje() + 1,
  'cobranca unificada com documento da rede destrava as unidades dela');

select * from finish();
rollback;
