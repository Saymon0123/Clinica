-- O cron que para em silêncio (migration 0165).
--
-- Sete rotinas automáticas sustentam o produto, e até a 0165 **nenhuma avisava
-- quando parava**. A auditoria olha DADO errado; um cron que deixa de rodar não
-- produz dado nenhum para olhar.
--
-- O caso que motivou: `estende-acesso-sem-debito` escreve `acesso_ate = hoje+1`.
-- Duas falhas seguidas tiram o CRM de toda barbearia pagante, de uma vez, e o
-- dono descobre pelo cliente reclamando.
--
-- Este teste prova as duas metades que um alarme precisa ter: que ele **dispara**
-- quando a rotina para, e que **fica calado** quando ela está em dia. A segunda
-- importa tanto quanto a primeira — alarme que grita à toa é alarme que se
-- aprende a ignorar, e aí ele não existe mais.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(6);

-- A rotina do acesso é a que motivou a migration; testar justamente ela mantém
-- o teste amarrado ao motivo. Se um dia ela for renomeada, este teste falha e
-- alguém relê isto aqui — que é o efeito desejado.
\set rotina 'estende-acesso-sem-debito'

select ok(
  (select count(*) from cron.job where jobname = :'rotina' and active) = 1,
  'a rotina do acesso existe e esta ativa'
);

-- ---------------------------------------------------------------------------
-- Dispara
-- ---------------------------------------------------------------------------
-- No banco do CI as rotinas existem (as migrations as agendam) e nunca rodaram,
-- então o estado de partida já é o de "nunca teve sucesso".

select is(
  (select count(*)::int from auditoria_crons where chave = 'cron-parado:' || :'rotina'),
  1,
  'rotina ativa que nunca rodou com sucesso vira alarme'
);

-- `ok(... like ...)` e nao o `like()` do pgTAP: `like` e palavra reservada no
-- Postgres, entao `select like(a, b, c)` nao parseia como chamada de funcao --
-- o arquivo morre no meio e leva o plano junto. Mesma familia do
-- `is(smallint, integer)` que derrubou o teste da 0163.
select ok(
  (select detalhe from auditoria_crons where chave = 'cron-parado:' || :'rotina')
    like '%NUNCA rodou com sucesso%',
  'e o texto diz que ela nunca rodou, em vez de inventar um atraso'
);

-- ---------------------------------------------------------------------------
-- Fica calado
-- ---------------------------------------------------------------------------
-- `runid` explicito e nao o default: o usuario do `supabase test db` nao e
-- superusuario e nao tem permissao na sequencia `cron.runid_seq` -- sem isto o
-- insert morre com "permission denied for sequence" e leva o plano junto. O
-- numero alto evita colidir com execucao real; o rollback apaga de qualquer
-- forma.
insert into cron.job_run_details (jobid, runid, status, start_time, end_time, database, username, command)
select jobid, 999000001, 'succeeded', now() - interval '2 hours', now() - interval '2 hours', 'postgres', 'postgres', 'x'
  from cron.job where jobname = :'rotina';

select is(
  (select count(*)::int from auditoria_crons where chave = 'cron-parado:' || :'rotina'),
  0,
  'com um sucesso recente, a rotina some do alarme'
);

-- ---------------------------------------------------------------------------
-- E volta a disparar quando o sucesso envelhece
-- ---------------------------------------------------------------------------
-- 30 horas para uma tolerância de 26: passou do limite, e por pouco -- é onde
-- um erro de sinal ou de unidade apareceria.
update cron.job_run_details set start_time = now() - interval '30 hours'
 where runid = 999000001;

select is(
  (select count(*)::int from auditoria_crons where chave = 'cron-parado:' || :'rotina'),
  1,
  'sucesso mais velho que a tolerancia volta a ser alarme'
);

-- ---------------------------------------------------------------------------
-- Chega onde o aviso sai
-- ---------------------------------------------------------------------------
-- O alarme só serve se chegar ao canal que já existe: `auditoria_pendente` é o
-- que o fluxo "Auditoria do Agente" lê para mandar e-mail. Uma view nova que
-- não entra no UNION é uma view que ninguém vê.
select is(
  (select count(*)::int from auditoria_pendente where chave = 'cron-parado:' || :'rotina'),
  1,
  'e chega em auditoria_pendente, que e por onde o aviso sai'
);

select * from finish();
rollback;
