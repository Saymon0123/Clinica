-- A cadeira que esvaziou em silêncio (migration 0168).
--
-- O cancelamento pelo link só mudava o status, e nada falava para fora: quem
-- fechou o CRM às 19h chegava no dia seguinte com a cadeira vazia e sem
-- explicação. A etapa 3 (o horário guardado no celular) piorou isso de
-- propósito — ela existe justamente para a pessoa cancelar sozinha.
--
-- O QUE ESTE TESTE PRENDE é a regra que decide o aviso inteiro: **quem
-- cancelou é inferido de `auth.uid()`**. Sessão logada (só o CRM tem) é a
-- barbearia; o resto do mundo — edge, n8n, pg_cron — é o cliente. Marcar cada
-- chamador a mão deixaria o próximo caminho nascer sem marca, e um aviso que
-- falha em silêncio é pior que não ter aviso: o dono passa a confiar nele.
--
-- E prende as duas exceções que impedem o aviso de virar ruído: o que a
-- barbearia mesma cancelou não vira aviso, e o cron de reativação diz quem é
-- para não ser confundido com o cliente.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

\set salao    'dddd9000-0000-0000-0000-000000000001'
\set barbeiro 'dddd9001-0000-0000-0000-000000000001'
\set servico  'dddd9002-0000-0000-0000-000000000001'
\set cliente  'dddd9003-0000-0000-0000-000000000001'
\set dono     'dddd9005-0000-0000-0000-000000000001'
\set defora   'dddd9004-0000-0000-0000-000000000001'
\set dedentro 'dddd9004-0000-0000-0000-000000000002'
\set docron   'dddd9004-0000-0000-0000-000000000003'
\set voltou   'dddd9004-0000-0000-0000-000000000004'

insert into salons (id, nome) values (:'salao', 'Cadeira Vazia');
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Bar', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
  values (:'servico', :'salao', 'Corte', 30, 40, true);
insert into clients (id, salon_id, nome, telefone)
  values (:'cliente', :'salao', 'Fulano', '41999990000');

insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values
  (:'defora',   :'salao', :'cliente', :'barbeiro', :'servico', now() + interval '2 days', 'agendado', 'publico'),
  (:'dedentro', :'salao', :'cliente', :'barbeiro', :'servico', now() + interval '3 days', 'agendado', 'publico'),
  (:'docron',   :'salao', :'cliente', :'barbeiro', :'servico', now() + interval '4 days', 'agendado', 'reativacao'),
  (:'voltou',   :'salao', :'cliente', :'barbeiro', :'servico', now() + interval '5 days', 'agendado', 'publico');

-- ── SEM sessão: é o cliente (edge do link público, agente pelo n8n) ─────────
update appointments set status = 'cancelado' where id = :'defora';

select is(
  (select cancelado_por from appointments where id = :'defora'),
  'cliente',
  'sem sessao logada, quem cancelou e o CLIENTE -- e por essa porta passam o link publico e o agente'
);

select isnt(
  (select cancelado_em from appointments where id = :'defora'),
  null,
  'o carimbo da hora continua sendo posto, como antes da 0168'
);

select is(
  (select count(*)::int from cancelamentos_a_avisar where id = :'defora'),
  1,
  'o cancelamento do cliente entra no aviso da Agenda'
);

-- ── COM sessão: é a barbearia, e NÃO vira aviso ────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', :'dono', 'role', 'authenticated')::text, true);
update appointments set status = 'cancelado' where id = :'dedentro';
select set_config('request.jwt.claims', '', true);

select is(
  (select cancelado_por from appointments where id = :'dedentro'),
  'barbearia',
  'com sessao logada, quem cancelou e a BARBEARIA'
);

select is(
  (select count(*)::int from cancelamentos_a_avisar where id = :'dedentro'),
  0,
  'a barbearia NAO e avisada do que ela mesma cancelou -- e o erro que o aviso de novo agendamento ja cometeu uma vez'
);

-- ── O cron diz quem é, e a inferência não passa por cima ────────────────────
update appointments set status = 'cancelado', cancelado_por = 'sistema' where id = :'docron';

select is(
  (select cancelado_por from appointments where id = :'docron'),
  'sistema',
  'marcacao explicita nao e sobrescrita pela inferencia: o cron de reativacao expira convite, ninguem cancelou nada'
);

select is(
  (select count(*)::int from cancelamentos_a_avisar where id = :'docron'),
  0,
  'convite de reativacao que venceu NAO enche o aviso do dono todo dia'
);

-- ── Dar ciência tira do aviso ──────────────────────────────────────────────
update appointments set cancelamento_visto_em = now() where id = :'defora';

select is(
  (select count(*)::int from cancelamentos_a_avisar where id = :'defora'),
  0,
  'depois da ciencia o aviso some -- aviso que nao some vira paisagem, e paisagem ninguem le'
);

-- ── Ressuscitar limpa o carimbo inteiro ────────────────────────────────────
update appointments set status = 'cancelado' where id = :'voltou';
update appointments set cancelamento_visto_em = now() where id = :'voltou';
update appointments set status = 'agendado' where id = :'voltou';

select ok(
  (select cancelado_por is null and cancelado_em is null and cancelamento_visto_em is null
     from appointments where id = :'voltou'),
  'o barbeiro desfez o cancelamento: o carimbo some inteiro, senao o horario volta para a agenda E continua na lista de cancelados'
);

select * from finish();
rollback;
