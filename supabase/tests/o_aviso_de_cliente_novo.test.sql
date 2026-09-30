-- O aviso de cliente novo (migration 0185).
--
-- Até aqui, uma barbearia podia se cadastrar e ninguém ficava sabendo. E em
-- 30/09 havia duas contas criadas que nunca viraram barbearia -- venda perdida
-- a um passo do fim, sem nada que a apontasse.
--
-- ## O que este teste guarda, em ordem de importância
--
-- 1. Que a fila continua **legível pelo `service_role`**. É o ponto que quase
--    derrubou tudo: as views de auditoria são `security_invoker`, e o
--    `service_role` (quem drena a fila pelo n8n) NÃO lê `auth.users`. Uma view
--    invoker lendo `auth.users` direto levanta "permission denied" DENTRO da
--    `auditoria_pendente` e, como ela é um `UNION ALL`, derruba **todos os
--    outros dez alarmes junto**. Por isso a leitura passa por uma função
--    `definer` em `private`, igual ao que a `auditoria_crons` faz com
--    `cron.job`.
--
-- 2. Que o barbeiro convidado **não** vira alarme falso. Ele não tem vínculo
--    ainda, e sem a exceção do convite aberto todo convite pendente viraria um
--    "cadastro parado".
--
-- 3. Que as três janelas de tempo valem: 3 horas para a conta parada, e 30
--    dias de teto nas duas pontas.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao_novo   'cccc1000-0000-0000-0000-000000000001'
\set salao_velho  'cccc1000-0000-0000-0000-000000000002'
\set dono_novo    'cccc1500-0000-0000-0000-000000000001'
\set parado       'cccc1500-0000-0000-0000-000000000002'
\set recem        'cccc1500-0000-0000-0000-000000000003'
\set convidado    'cccc1500-0000-0000-0000-000000000004'
\set prof_novo    'cccc1100-0000-0000-0000-000000000001'

insert into auth.users (id, email, created_at) values
  (:'dono_novo', 'dono@teste185.local',      now() - interval '1 hour'),
  -- Passou das 3 horas e não virou barbearia: é o alarme.
  (:'parado',    'parado@teste185.local',    now() - interval '5 hours'),
  -- Criou a conta agora: ainda pode estar preenchendo o segundo passo.
  (:'recem',     'recem@teste185.local',     now() - interval '30 minutes'),
  -- Tem convite aberto: é barbeiro esperado, não dono que desistiu.
  (:'convidado', 'convidado@teste185.local', now() - interval '2 days');

insert into salons (id, nome, telefone, ativo, created_at) values
  (:'salao_novo',  'Barbearia Nova',  '(41) 90000-0001', true, now() - interval '2 hours'),
  -- Fora da janela de 30 dias: é história, não notícia.
  (:'salao_velho', 'Barbearia Velha', '(41) 90000-0002', true, now() - interval '60 days');

insert into user_salons (user_id, salon_id, role) values (:'dono_novo', :'salao_novo', 'owner');
insert into professionals (id, salon_id, nome, ativo, user_id)
values (:'prof_novo', :'salao_novo', 'Dona Maria', true, :'dono_novo');

-- O convite que existe e ainda não foi usado.
insert into salon_invites (salon_id, token, nome, email, role, expira_em)
values (:'salao_novo', 'token-teste-185', 'Convidado',
        'convidado@teste185.local', 'barbeiro', now() + interval '7 days');

------------------------------------------------------------------ a notícia

select ok(
  exists (select 1 from auditoria_pendente where chave = 'barbearia-nova:' || :'salao_novo'),
  'barbearia cadastrada ha 2 horas entra na fila -- e esta e a unica notica boa dela'
);

select ok(
  (select detalhe from auditoria_pendente where chave = 'barbearia-nova:' || :'salao_novo')
    like '%Dona Maria%',
  'o detalhe traz o nome do DONO, e nao o primeiro profissional da lista'
);

select ok(
  not exists (select 1 from auditoria_pendente where chave = 'barbearia-nova:' || :'salao_velho'),
  'barbearia de 60 dias fica fora: o teto de 30 dias impede a fila de virar historico'
);

------------------------------------------------------------ a venda perdida

select ok(
  exists (select 1 from auditoria_pendente where chave = 'conta-sem-barbearia:' || :'parado'),
  'conta de 5 horas sem barbearia entra: e a venda que parou a um passo do fim'
);

select ok(
  not exists (select 1 from auditoria_pendente where chave = 'conta-sem-barbearia:' || :'recem'),
  'conta de 30 minutos NAO entra: 3 horas e a regua, para nao alarmar quem so foi jantar'
);

select ok(
  not exists (select 1 from auditoria_pendente where chave = 'conta-sem-barbearia:' || :'convidado'),
  'quem tem convite aberto nao e cadastro parado -- sem isto, todo convite viraria alarme falso'
);

------------------------------------------------------------------- o dedup

insert into auditoria_avisos (chave, avisado_em)
values ('barbearia-nova:' || :'salao_novo', now());

select ok(
  not exists (select 1 from auditoria_pendente where chave = 'barbearia-nova:' || :'salao_novo'),
  'avisado uma vez, sai da fila: o mesmo cliente novo nao vira e-mail de meia em meia hora'
);

--------------------------------------------- e o que quase derrubou tudo

-- A fila é lida pelo n8n como `service_role`. Se a view precisar de leitura em
-- `auth.users`, isto levanta "permission denied" e leva junto os outros dez
-- alarmes do UNION.
set local role service_role;
select lives_ok(
  'select count(*) from auditoria_pendente',
  'o service_role drena a fila inteira -- a leitura de auth.users passa pela funcao definer, nao pela view'
);
reset role;

select * from finish();
rollback;
