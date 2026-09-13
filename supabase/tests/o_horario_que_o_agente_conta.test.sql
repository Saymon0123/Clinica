-- O horário que o agente conta ao cliente (migration 0171).
--
-- `agendamentos_do_cliente` é a única fonte que o agente do WhatsApp tem para
-- responder "que horário eu tenho marcado?". Se ela mentir, ele mente com
-- confiança -- e o cliente chega no dia errado, ou não chega.
--
-- Duas mentiras já estavam lá quando fomos olhar:
--
--   `servico` lia só `a.service_id`. Desde o corte+barba num agendamento só,
--   isso é o PRIMEIRO serviço, não o que foi marcado.
--
--   quem filtrava por `status <> 'cancelado'` recebia junto o `concluido` e o
--   `faltou`. Na conta real deste banco, a consulta do agente devolvia dois
--   horários para o mesmo amanhã, e um deles não existia mais.
--
-- E O TRINCO: view recriada no `public` nasce com as permissões padrão do
-- Supabase, `anon` incluso. A 0036 e a 0038 revogaram à mão; a 0171 também.
-- Some o revoke e a agenda de qualquer cliente vira uma chamada REST.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao    'aaaa7100-0000-0000-0000-000000000001'
\set barbeiro 'aaaa7101-0000-0000-0000-000000000001'
\set corte    'aaaa7102-0000-0000-0000-000000000001'
\set barba    'aaaa7102-0000-0000-0000-000000000002'
\set cliente  'aaaa7103-0000-0000-0000-000000000001'
\set dois     'aaaa7104-0000-0000-0000-000000000001'
\set um       'aaaa7104-0000-0000-0000-000000000002'
\set feito    'aaaa7104-0000-0000-0000-000000000003'
\set furou    'aaaa7104-0000-0000-0000-000000000004'
\set morto    'aaaa7104-0000-0000-0000-000000000005'
\set firme    'aaaa7104-0000-0000-0000-000000000006'

insert into salons (id, nome) values (:'salao', 'Conta Certa');
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Rafa', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte', :'salao', 'Corte masculino', 40, 45, true),
  (:'barba', :'salao', 'Barba',           30, 30, true);
insert into clients (id, salon_id, nome, telefone) values (:'cliente', :'salao', 'Fulano', '41999990000');

-- Cinco horários amanhã, um por status, e um deles com dois serviços.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values
  (:'dois',  :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '09:00') at time zone 'America/Sao_Paulo', 'agendado',  'publico'),
  (:'um',    :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '11:00') at time zone 'America/Sao_Paulo', 'agendado',  'agente'),
  (:'feito', :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '13:00') at time zone 'America/Sao_Paulo', 'concluido', 'crm'),
  (:'furou', :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '15:00') at time zone 'America/Sao_Paulo', 'faltou',    'crm'),
  (:'morto', :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '17:00') at time zone 'America/Sao_Paulo', 'cancelado', 'publico'),
  (:'firme', :'salao', :'cliente', :'barbeiro', :'corte', ((current_date + 1) + time '18:00') at time zone 'America/Sao_Paulo', 'confirmado','publico');

-- O de 09:00 foi marcado como corte + barba. Só a barba entra à mão: o gatilho
-- `trg_espelha_servico_principal` já gravou o corte com ordem 1 no insert
-- acima -- é assim que a agenda pública monta um agendamento de dois serviços.
insert into appointment_services (appointment_id, service_id, ordem) values
  (:'dois', :'barba', 2);

-- E um agendamento SEM linha filha nenhuma, para exercitar o fallback do
-- serviço principal. Na vida real o gatilho não deixa isso acontecer: este
-- caso existe para a view não devolver nulo se um dia deixar.
delete from appointment_services where appointment_id = :'um';

-- ── O serviço é o que ele marcou, não o primeiro ───────────────────────────
select is(
  (select servico from agendamentos_do_cliente where id = :'dois'),
  'Corte masculino + Barba',
  'o servico soma appointment_services na ordem escolhida -- O DEFEITO: lendo so service_id, o cliente ouviria "Corte masculino" para um corte+barba'
);

select is(
  (select servico from agendamentos_do_cliente where id = :'um'),
  'Corte masculino',
  'sem linha filha nenhuma, cai no servico principal em vez de devolver nulo'
);

-- ── `de_pe` separa o que está marcado do que já acabou ─────────────────────
select is(
  (select array_agg(hora_local order by hora_local)
     from agendamentos_do_cliente
    where client_id = :'cliente' and de_pe),
  array['09:00', '11:00', '18:00'],
  'de_pe traz agendado e confirmado, e SO eles -- O DEFEITO: com status <> cancelado, o agente anunciaria tambem o concluido das 13:00 e o faltou das 15:00'
);

select is(
  (select count(*)::int from agendamentos_do_cliente
    where client_id = :'cliente' and not de_pe),
  3,
  'concluido, faltou e cancelado ficam na view (o historico serve para outras perguntas), mas fora de de_pe'
);

-- ── Os campos prontos, para ninguém converter fuso de cabeça ───────────────
select is(
  (select quando from agendamentos_do_cliente where id = :'dois'),
  'amanha',
  'quando vem pronto: o agente nunca calcula data'
);

select is(
  (select data_local from agendamentos_do_cliente where id = :'dois'),
  to_char(current_date + 1, 'DD/MM/YYYY'),
  'data_local em horario de Sao Paulo, nao em UTC'
);

-- ── O trinco ───────────────────────────────────────────────────────────────
select ok(
  not has_table_privilege('anon', 'public.agendamentos_do_cliente', 'select'),
  'anon nao le a agenda de ninguem -- view recriada no public nasce aberta para anon, e a 0171 recriou esta'
);

select ok(
  has_table_privilege('authenticated', 'public.agendamentos_do_cliente', 'select')
  and has_table_privilege('service_role', 'public.agendamentos_do_cliente', 'select'),
  'quem precisa ler continua lendo: o CRM logado e o agente pelo service_role'
);

select * from finish();
rollback;
