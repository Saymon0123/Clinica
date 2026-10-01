-- A saúde do canal oficial na auditoria (migration 0196).
--
-- ## O erro que este teste existe para impedir de voltar
--
-- Em 01/10 eu reportei o canal oficial como bloqueado e estava errado: li
-- `health_status` com um token que só tem `whatsapp_business_management`, e esse
-- campo é relativo ao **App do token que faz a chamada**. O erro 141011
-- descrevia o meu token, não o número — a `analytics` da WABA mostrou 14
-- mensagens, 100% entregues.
--
-- Se a checagem automática repetir esse erro, ela grita bloqueio **todo dia**,
-- para sempre, e alarme que grita todo dia é alarme que ninguém lê. Pior: ele
-- esconderia o bloqueio de verdade quando ele chegasse.
--
-- **A asserção 2 é o coração deste arquivo.** Ela exige que leitura vinda de
-- token sem escopo de envio NÃO produza alarme de bloqueio — e que produza, em
-- vez disso, um aviso sobre a própria checagem estar cega.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set numero '555500000001'

-- O remetente de teste. `esperados` da view sai daqui, então sem ele o caso
-- "ninguém checou" não teria nada para cobrar.
insert into remetentes_oficiais (phone_number_id, rotulo, waba_id, ativo)
values (:'numero', 'teste-0196', '999999999999999', true);

------------------------------------------------- 1. ninguem checou ainda

select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave = 'canal-sem-checagem:' || :'numero'),
  1,
  'remetente ativo e sem nenhuma leitura: alarma que ninguem checou'
);

select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave = 'canal-bloqueado:' || :'numero'),
  0,
  'e NAO inventa bloqueio quando nunca se leu nada'
);

--------------------------- 2. O CORACAO: token cego nao alarma bloqueio

select private.registrar_saude_do_canal(
  :'numero', 'BLOCKED', false,
  '{"APP":{"can_send_message":"BLOCKED","error":141011}}'::jsonb
);

select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave = 'canal-bloqueado:' || :'numero'),
  0,
  'leitura de token SEM escopo de envio NAO vira alarme de bloqueio'
);

select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave = 'canal-checagem-cega:' || :'numero'),
  1,
  'ela vira aviso de que a CHECAGEM esta cega, que e onde o defeito esta'
);

select is(
  (select gravidade from auditoria_canal_oficial
    where chave = 'canal-checagem-cega:' || :'numero'),
  'aviso',
  'checagem cega e aviso, nao grave: o canal pode estar perfeito'
);

--------------------------------- 3. token que envia, canal saudavel: silencio

select private.registrar_saude_do_canal(:'numero', 'AVAILABLE', true, null);

select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave like '%' || :'numero'),
  0,
  'token que envia lendo AVAILABLE: nenhum alarme, nem o de checagem cega'
);

------------------------------------ 4. token que envia, bloqueado: grave

select private.registrar_saude_do_canal(
  :'numero', 'BLOCKED', true,
  '{"APP":{"can_send_message":"BLOCKED","error":141011}}'::jsonb
);

select is(
  (select gravidade from auditoria_canal_oficial
    where chave = 'canal-bloqueado:' || :'numero'),
  'grave',
  'token que envia lendo BLOCKED: alarme grave, agora sim'
);

-- A leitura mais nova manda. `lido_em` empata quando as duas caem no mesmo
-- instante -- e caem, porque `now()` nao anda dentro de uma transacao --, então
-- o desempate e o `id`. Sem ele a view devolveria a leitura antiga como atual.
select is(
  (select count(*)::int from auditoria_canal_oficial
    where chave = 'canal-checagem-cega:' || :'numero'),
  0,
  'a leitura MAIS NOVA manda, mesmo com lido_em empatado'
);

------------------------------------------ 5. chega na auditoria_pendente

select is(
  (select count(*)::int from auditoria_pendente
    where chave = 'canal-bloqueado:' || :'numero'),
  1,
  'o alarme novo chega na auditoria_pendente, que e quem o n8n le'
);

insert into auditoria_avisos (chave) values ('canal-bloqueado:' || :'numero');

select is(
  (select count(*)::int from auditoria_pendente
    where chave = 'canal-bloqueado:' || :'numero'),
  0,
  'e auditoria_avisos continua suprimindo o que ja foi comunicado'
);

--------------------------------------------------------------- 6. o trinco

-- As duas coisas que o `drop` + `create` da `auditoria_pendente` quase levou: o
-- `security_invoker` (que o create nao herda) e a ausencia de grant para
-- anon/authenticated (que o padrao do schema devolve). Esta view cruza TODAS as
-- barbearias: sem as duas, chamada anonima leria o sistema inteiro, sem RLS.
select ok(
  (select 'security_invoker=on' = any(reloptions) from pg_class
    where oid = 'public.auditoria_pendente'::regclass)
  and (select 'security_invoker=on' = any(reloptions) from pg_class
        where oid = 'public.auditoria_canal_oficial'::regclass)
  and not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('auditoria_pendente', 'auditoria_canal_oficial')
       and grantee in ('anon', 'authenticated')
  )
  and not has_function_privilege('anon',
        'private.registrar_saude_do_canal(text,text,boolean,jsonb)', 'execute'),
  'security_invoker nas duas views, nenhum grant para anon/authenticated, e a RPC fechada'
);

select * from finish();
rollback;
