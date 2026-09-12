-- A mensagem do cliente não se perde (migration 0162 — achado A3).
--
-- O defeito que este teste cobre não tem tela: o cliente escreve, o n8n está
-- fora do ar, e a mensagem deixa de existir. Ninguém do lado de cá fica sabendo
-- o que foi escrito, e do lado de lá alguém espera uma resposta que não vem.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set salao   'eeee9000-0000-0000-0000-000000000001'
\set wamid   'wamid.TESTE0001'
\set wamid2  'wamid.TESTE0002'
\set wamid3  'wamid.TESTE0003'
\set wamid4  'wamid.TESTE0004'

insert into salons (id, nome) values (:'salao', 'Barbearia Da Fila');

-- ---------------------------------------------------------------------------
-- Gravar antes de entregar, e a reentrega da Meta não vira segunda resposta
-- ---------------------------------------------------------------------------

select is(
  (select registrar_mensagem_recebida(:'wamid', :'salao', '123', '5541999990001',
                                      'Cliente', 'texto', '{"texto":"oi"}'::jsonb)),
  true,
  'a primeira vez que a mensagem chega, ela e nova'
);

-- A Meta reentrega o mesmo evento quando acha que não recebemos. Sem esta
-- trava, o agente responderia duas vezes à mesma frase.
select is(
  (select registrar_mensagem_recebida(:'wamid', :'salao', '123', '5541999990001',
                                      'Cliente', 'texto', '{"texto":"oi"}'::jsonb)),
  false,
  'a reentrega da mesma mensagem pela Meta nao e nova'
);

select is(
  (select count(*)::int from mensagens_recebidas where message_id = :'wamid'),
  1,
  'e nao duplica a linha'
);

-- ---------------------------------------------------------------------------
-- A fila
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from mensagens_a_entregar where message_id = :'wamid'),
  1,
  'mensagem que nao foi entregue fica na fila'
);

select lives_ok(
  format($$select marcar_mensagem_entregue(%L)$$, :'wamid'),
  'marcar a entrega roda sem erro'
);

select is(
  (select count(*)::int from mensagens_a_entregar where message_id = :'wamid'),
  0,
  'e entregue ela sai da fila'
);

-- Cinco tentativas: passou disso o problema não é intermitência, é a mensagem.
-- Girar para sempre com um payload que o agente recusa é pior do que parar.
select registrar_mensagem_recebida(:'wamid2', :'salao', '123', '5541999990002',
                                   'Cliente Dois', 'texto', '{"texto":"oi"}'::jsonb);
update mensagens_recebidas set tentativas = 5 where message_id = :'wamid2';

select is(
  (select count(*)::int from mensagens_a_entregar where message_id = :'wamid2'),
  0,
  'depois de cinco tentativas a mensagem sai da fila em vez de girar para sempre'
);

-- Fora da janela de 24h da Meta não dá para responder texto livre. Reentregar
-- faria o agente escrever uma resposta que a Meta recusa.
select registrar_mensagem_recebida(:'wamid3', :'salao', '123', '5541999990003',
                                   'Cliente Tres', 'texto', '{"texto":"oi"}'::jsonb);
update mensagens_recebidas set recebida_em = now() - interval '26 hours'
 where message_id = :'wamid3';

select is(
  (select count(*)::int from mensagens_a_entregar where message_id = :'wamid3'),
  0,
  'fora da janela de 24h da Meta a mensagem sai da fila: nao da mais para responder'
);

-- ---------------------------------------------------------------------------
-- O alarme
-- ---------------------------------------------------------------------------
-- Quinze minutos parada quer dizer agente mudo AGORA, com gente esperando.

select registrar_mensagem_recebida(:'wamid4', :'salao', '123', '5541999990004',
                                   'Cliente Quatro', 'texto', '{"texto":"oi"}'::jsonb);
update mensagens_recebidas set recebida_em = now() - interval '20 minutes'
 where message_id = :'wamid4';

select is(
  (select count(*)::int from auditoria_mensagens where chave = 'mensagem-parada:' || :'wamid4'),
  1,
  'mensagem parada ha mais de 15 minutos vira alarme'
);

-- Alarme que não chega a lugar nenhum não é alarme. `auditoria_pendente` é o
-- que o fluxo de auditoria do n8n lê para mandar e-mail.
select is(
  (select count(*)::int from auditoria_pendente where chave = 'mensagem-parada:' || :'wamid4'),
  1,
  'e chega em auditoria_pendente, que e por onde o aviso sai'
);

-- ---------------------------------------------------------------------------
-- Quem pode chamar
-- ---------------------------------------------------------------------------
-- A tabela guarda o que o cliente escreveu. Só a edge (definer) e o n8n
-- (service_role) passam por aqui — a equipe da barbearia, não.

select ok(
  not has_function_privilege('anon', 'public.registrar_mensagem_recebida(text,uuid,text,text,text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_mensagem_recebida(text,uuid,text,text,text,text,jsonb)', 'execute'),
  'gravar mensagem recebida nao e chamavel por quem esta logado nem por quem nao esta'
);

select * from finish();
rollback;
