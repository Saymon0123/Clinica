-- A cadeia de cobrança (migration 0130, Parte 2, passo 2.1 — achados 17, 18, 19 e 22).
--
-- Os quatro defeitos moram no mesmo lugar e todos custam dinheiro, em direções
-- opostas: dois cobravam a mais (o mesmo período duas vezes, e os dias de teste
-- grátis), um bloqueava quem não devia nada, e o último deixava a rede inteira
-- sem boleto em silêncio.
--
-- Nenhum deles aparece numa tela. É por isso que o teste existe: são regras que
-- só se manifestam num dia 1º, no cancelamento de alguém, ou na hora de emitir
-- um boleto — quando já é tarde para descobrir.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(17);

-- O relogio deste teste e o MESMO de `estender_acesso_sem_debito`: America/
-- Sao_Paulo. `current_date` no runner do CI e UTC, e entre 21h e meia-noite de
-- Brasilia as duas datas divergem em um dia -- a funcao gravava `acesso_ate =
-- hoje_SP + 1` e a assercao comparava com `hoje_UTC`, que ja era o mesmo dia,
-- fazendo o `>` virar falso. O teste quebrou assim em 04/09/2026, as 02:31 UTC,
-- num commit que so mexia em documentacao.
create or replace function pg_temp.hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

\set salao_trial   'aaaa9000-0000-0000-0000-000000000001'
\set salao_cancela 'aaaa9000-0000-0000-0000-000000000002'
\set salao_devendo 'aaaa9000-0000-0000-0000-000000000003'
\set salao_em_teste 'aaaa9000-0000-0000-0000-000000000004'
\set salao_cancelou 'aaaa9000-0000-0000-0000-000000000005'
\set rede          'aaaa9000-0000-0000-0000-00000000000f'

insert into salons (id, nome) values
  (:'salao_trial', 'Teste Trial'),
  (:'salao_cancela', 'Teste Cancelamento'),
  (:'salao_devendo', 'Teste Devendo'),
  (:'salao_em_teste', 'Teste Ainda Em Teste'),
  (:'salao_cancelou', 'Teste Cancelou');

-- ---------------------------------------------------------------------------
-- O gatilho que grava o fim do teste
-- ---------------------------------------------------------------------------

insert into subscriptions (salon_id, status, acesso_ate)
values (:'salao_trial', 'trial', date '2026-08-20');

select is(
  (select trial_ate from subscriptions where salon_id = :'salao_trial'),
  date '2026-08-20',
  'assinatura que nasce em teste ganha trial_ate sozinha'
);

-- O primeiro pagamento empurra `acesso_ate` para frente. Se `trial_ate` fosse
-- junto, a barbearia voltaria a ser cobrada pelos dias de teste todo mês.
update subscriptions set status = 'ativa', acesso_ate = date '2026-12-31'
 where salon_id = :'salao_trial';

select is(
  (select trial_ate from subscriptions where salon_id = :'salao_trial'),
  date '2026-08-20',
  'trial_ate nao anda quando acesso_ate anda no primeiro pagamento'
);

-- ---------------------------------------------------------------------------
-- Achado 18 — dia de teste não se cobra
-- ---------------------------------------------------------------------------

select is(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_trial', date '2026-08-01', date '2026-08-31', 'mensal')),
  date '2026-08-21',
  'a fatura comeca no dia seguinte ao fim do teste, nao no dia 1'
);

-- Acesso vencendo HOJE e teste terminando HOJE: é o único arranjo em que a
-- guarda do teste é de fato exercida. Com prazo folgado, o job não mexeria
-- nele de qualquer jeito e o teste passaria sem provar nada.
insert into subscriptions (salon_id, status, acesso_ate)
values (:'salao_em_teste', 'trial', pg_temp.hoje());

-- `gerar_fatura_de_uso` devolve um COMPOSTO, não um conjunto: chamada em FROM
-- ela sempre rende uma linha, com as colunas nulas quando não há fatura. Contar
-- linhas aqui daria 1 e o teste passaria verde sem provar nada — quem responde
-- pela ausência é o campo, não o `count`.
select is(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_em_teste', date '2026-08-01', date '2026-08-31', 'mensal')),
  null::date,
  'periodo inteiro dentro do teste nao gera fatura nenhuma'
);

select is(
  (select count(*)::int from faturas_de_uso where salon_id = :'salao_em_teste'),
  0,
  'e nao deixa nem uma fatura de R$ 0,00 na lista do dono'
);

-- ---------------------------------------------------------------------------
-- Achado 17 — o mesmo dia não se cobra duas vezes
-- ---------------------------------------------------------------------------

insert into subscriptions (salon_id, status, acesso_ate, trial_ate)
values (:'salao_cancela', 'ativa', date '2026-12-31', date '2026-07-01');

insert into faturas_de_uso (salon_id, periodo_inicio, periodo_fim, motivo,
                            barbeiros, preco_unitario, agendamentos, lembretes, reativacoes,
                            valor, valor_gerado, detalhe)
values (:'salao_cancela', date '2026-07-01', date '2026-07-31', 'mensal',
        1, 0.75, 0, 0, 0, 0, 0, '[]'::jsonb);

-- A fatura de cancelamento vai do dia seguinte à última até hoje.
select is(
  (select periodo_inicio from gerar_fatura_de_cancelamento(:'salao_cancela')),
  date '2026-08-01',
  'a fatura de cancelamento comeca onde a anterior parou'
);

-- E o fechamento mensal, rodando depois sobre o mesmo mês, não repete nada.
-- Era exatamente aqui que o mesmo dia era cobrado duas vezes.
select is(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_cancela', date '2026-08-01', date '2026-08-31', 'mensal')),
  null::date,
  'o fechamento mensal nao recobra o periodo que o cancelamento ja fechou'
);

-- Idempotência de graça: a segunda chamada do mesmo período não cria nada.
select is(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_trial', date '2026-08-01', date '2026-08-31', 'mensal')),
  null::date,
  'chamar o mesmo periodo duas vezes nao cria a segunda fatura'
);

-- O invariante que resume os dois achados: para nenhuma barbearia, dois dias
-- faturados podem se sobrepor.
select is(
  (select count(*)::int
     from faturas_de_uso a join faturas_de_uso b
       on a.salon_id = b.salon_id and a.id < b.id
      and daterange(a.periodo_inicio, a.periodo_fim, '[]') && daterange(b.periodo_inicio, b.periodo_fim, '[]')),
  0,
  'nenhum dia e coberto por duas faturas da mesma barbearia'
);

-- ---------------------------------------------------------------------------
-- Achado 19 — quem não deve não é bloqueado
-- ---------------------------------------------------------------------------

-- Terminou o teste, acesso vencido, e a fatura que tem é de R$ 0,00 sem boleto
-- emitido. Era este que ficava bloqueado para sempre, devendo nada.
insert into subscriptions (salon_id, status, acesso_ate, trial_ate)
values (:'salao_devendo', 'ativa', pg_temp.hoje() - 5, pg_temp.hoje() - 30);

update subscriptions set acesso_ate = pg_temp.hoje() - 5 where salon_id = :'salao_trial';

-- Este deve de verdade: fatura com valor, boleto emitido e vencido sem pagar.
insert into faturas_de_uso (salon_id, periodo_inicio, periodo_fim, motivo,
                            barbeiros, preco_unitario, agendamentos, lembretes, reativacoes,
                            valor, valor_gerado, detalhe, boleto_vencimento)
values (:'salao_devendo', date '2026-06-01', date '2026-06-30', 'mensal',
        1, 0.75, 40, 0, 0, 30, 0, '[]'::jsonb, pg_temp.hoje() - 2);

-- Cancelou: o acesso corre até a data que já tem e acaba ali.
insert into subscriptions (salon_id, status, acesso_ate, trial_ate)
values (:'salao_cancelou', 'cancelada', pg_temp.hoje() - 5, pg_temp.hoje() - 30);

select lives_ok(
  $$select estender_acesso_sem_debito()$$,
  'o job diario roda sem erro'
);

select ok(
  (select acesso_ate from subscriptions where salon_id = :'salao_trial') > pg_temp.hoje(),
  'quem terminou o teste e nao deve nada volta a ter acesso'
);

select ok(
  (select acesso_ate from subscriptions where salon_id = :'salao_devendo') < pg_temp.hoje(),
  'quem tem boleto vencido em aberto continua bloqueado'
);

select ok(
  (select acesso_ate from subscriptions where salon_id = :'salao_em_teste') = pg_temp.hoje(),
  'quem ainda esta em teste nao ganha prazo extra'
);

select ok(
  (select acesso_ate from subscriptions where salon_id = :'salao_cancelou') < pg_temp.hoje(),
  'quem cancelou nao volta a ter acesso'
);

-- ---------------------------------------------------------------------------
-- Achado 22 — boleto único da rede exige documento
-- ---------------------------------------------------------------------------

insert into organizations (id, nome) values (:'rede', 'Rede de Teste');

select throws_ok(
  format($$update organizations set cobranca_unificada = true where id = %L$$, :'rede'),
  '23514',
  null,
  'nao da para ligar o boleto unico da rede sem documento'
);

select throws_ok(
  format($$update organizations set cobranca_unificada = true, cpf_cnpj = '11144477734' where id = %L$$, :'rede'),
  '23514',
  null,
  'nem com CPF de digito verificador errado'
);

-- O caminho que ninguém lembra de testar: ligar com documento válido e apagar
-- o documento depois.
update organizations set cobranca_unificada = true, cpf_cnpj = '111.444.777-35' where id = :'rede';

select throws_ok(
  format($$update organizations set cpf_cnpj = null where id = %L$$, :'rede'),
  '23514',
  null,
  'nem apagar o documento depois de ligado'
);

select * from finish();
rollback;
