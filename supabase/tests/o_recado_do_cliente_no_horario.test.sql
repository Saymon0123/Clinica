-- O recado do cliente no horário (migration 0178).
--
-- "Separar uma pomada" não é venda: é recado. O agente do WhatsApp anota, o
-- barbeiro lê antes de atender e lança na comanda no balcão, onde o estoque é
-- real e o pagamento acontece. O que se prende aqui:
--
--   · o recado chega limpo (trim) e carimbado, e a VIEW do agente o carrega
--     junto do horário — senão ele anotaria por cima do que já foi pedido;
--   · recado vazio APAGA, e o carimbo vai junto (data sem recado não
--     corresponde a nada);
--   · acima de 280 volta recusa com motivo, sem gravar nada — e o CHECK
--     segura a escrita direta, que não passa pela RPC;
--   · horário que já começou não recebe recado (ninguém vai ler);
--   · autorização dupla (client_id do agente, token do link) e o trinco de
--     permissões, que view recriada no `public` perde em silêncio.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(19);

\set salao    'ee017800-0000-0000-0000-000000000001'
\set barbeiro 'ee017801-0000-0000-0000-000000000001'
\set corte    'ee017802-0000-0000-0000-000000000001'
\set barba    'ee017802-0000-0000-0000-000000000002'
\set cli      'ee017803-0000-0000-0000-000000000001'
\set cli2     'ee017803-0000-0000-0000-000000000002'
\set ag       'ee017804-0000-0000-0000-000000000001'
\set passado  'ee017804-0000-0000-0000-000000000002'

-- "Amanhã" NO RELÓGIO DE SÃO PAULO (lição do PR #167: o runner vive em UTC).
create function pg_temp.amanha_sp(h time) returns timestamptz
language sql as $$
  select (((now() at time zone 'America/Sao_Paulo')::date + 1) + h) at time zone 'America/Sao_Paulo'
$$;

insert into salons (id, nome, ativo) values (:'salao', 'Recado Certo', true);
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Rafa', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte', :'salao', 'Corte', 40, 45, true),
  (:'barba', :'salao', 'Barba', 30, 30, true);
insert into clients (id, salon_id, nome, telefone) values
  (:'cli',  :'salao', 'Fulano',   '41966660001'),
  (:'cli2', :'salao', 'Beltrano', '41966660002');

-- Corte + barba amanhã às 10:00 (a barba à mão: o gatilho da 0120 já gravou o
-- corte como ordem 1 no insert).
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'ag', :'salao', :'cli', :'barbeiro', :'corte', pg_temp.amanha_sp(time '10:00'), 'agendado', 'agente');
insert into appointment_services (appointment_id, service_id, ordem)
values (:'ag', :'barba', 2) on conflict do nothing;

-- ── Anotar ──────────────────────────────────────────────────────────────────

select ok(
  (anotar_recado_pelo_cliente(:'ag', '  Separar uma pomada modeladora  ', :'cli', null)->>'ok')::boolean,
  'o recado do cliente e anotado no horario');
select is(
  (select recado_do_cliente from appointments where id = :'ag'),
  'Separar uma pomada modeladora',
  'o recado chega sem os espacos das pontas');
select ok(
  (select recado_em is not null from appointments where id = :'ag'),
  'o carimbo de quando o recado veio foi gravado');

-- ── A view que o agente lê ──────────────────────────────────────────────────

select is(
  (select recado from agendamentos_do_cliente where id = :'ag'),
  'Separar uma pomada modeladora',
  'a view do agente carrega o recado junto do horario');
select is(
  (select servico from agendamentos_do_cliente where id = :'ag'),
  'Corte + Barba',
  'a view recriada continua somando os servicos (0171 nao se perdeu)');

-- ── Apagar ──────────────────────────────────────────────────────────────────

select ok(
  (anotar_recado_pelo_cliente(:'ag', '   ', :'cli', null)->>'apagado')::boolean,
  'recado em branco apaga o que estava lá');
select ok(
  (select recado_do_cliente is null and recado_em is null from appointments where id = :'ag'),
  'apagar o recado leva o carimbo junto');

-- ── O teto de 280 ───────────────────────────────────────────────────────────

select ok(
  not (anotar_recado_pelo_cliente(:'ag', repeat('x', 281), :'cli', null)->>'ok')::boolean,
  'recado acima de 280 caracteres e recusado');
-- `ok(... like ...)` e nao o `like()` do pgTAP: `like` e palavra reservada.
select ok(
  anotar_recado_pelo_cliente(:'ag', repeat('x', 281), :'cli', null)->>'motivo' like '%280%',
  'o motivo diz qual e o limite, para o agente resumir');
select ok(
  (select recado_do_cliente is null from appointments where id = :'ag'),
  'a recusa por tamanho nao grava nada');
select throws_ok(
  format($$update appointments set recado_do_cliente = repeat('y', 300) where id = %L$$,
         'ee017804-0000-0000-0000-000000000001'::uuid),
  '23514', null, 'o CHECK segura a escrita direta, que nao passa pela RPC');

-- ── Horário que já passou ───────────────────────────────────────────────────

insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, data_hora_fim, status, origem)
values (:'passado', :'salao', :'cli2', :'barbeiro', :'corte',
        now() - interval '2 hours', now() - interval '80 minutes', 'agendado', 'crm');
select ok(
  not (anotar_recado_pelo_cliente(:'passado', 'tarde demais', :'cli2', null)->>'ok')::boolean,
  'horario que ja comecou nao recebe recado');
select ok(
  anotar_recado_pelo_cliente(:'passado', 'tarde demais', :'cli2', null)->>'motivo' like '%ja comecou%',
  'e o motivo manda falar direto com a barbearia');

-- ── Autorização ─────────────────────────────────────────────────────────────

select throws_ok(
  format($$select anotar_recado_pelo_cliente(%L, 'nao e meu', %L, null)$$,
         'ee017804-0000-0000-0000-000000000001'::uuid,
         'ee017803-0000-0000-0000-000000000002'::uuid),
  '42501', null, 'cliente errado leva 42501, nao o recado de outra pessoa');
select ok(
  (anotar_recado_pelo_cliente(:'ag', 'pelo link de gestao',
     null, (select token_gestao from appointments where id = :'ag'))->>'ok')::boolean,
  'o token de gestao autoriza sozinho (a porta do link publico)');

-- ── O trinco ────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.anotar_recado_pelo_cliente(uuid,text,uuid,uuid)', 'execute'),
  'anon nao executa a RPC do recado');
select ok(
  not has_function_privilege('authenticated', 'public.anotar_recado_pelo_cliente(uuid,text,uuid,uuid)', 'execute'),
  'authenticated nao executa a RPC do recado');
select ok(
  has_function_privilege('service_role', 'public.anotar_recado_pelo_cliente(uuid,text,uuid,uuid)', 'execute'),
  'service_role executa (as duas portas passam por servidor)');
select ok(
  not has_table_privilege('anon', 'public.agendamentos_do_cliente', 'select'),
  'a view recriada continua fechada para anon');

select * from finish();
rollback;
