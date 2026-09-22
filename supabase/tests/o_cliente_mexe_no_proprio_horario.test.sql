-- O cliente mexe no próprio horário (migration 0176).
--
-- As três RPCs da porta do CLIENTE: alterar os serviços de um agendamento de
-- pé (a sobrancelha lembrada depois do corte), remarcar de verdade pelo
-- agente (sem o "cancelar + criar" que sujava as métricas) e criar já com
-- vários serviços. O que se prende aqui:
--
--   · esticar o horário recalcula o fim e A TRAVA decide se cabe — recusa
--     não deixa rastro (filhas e fim intactos, subtransação desfeita);
--   · a régua do cliente: piso de 30min, jornada e fechamento respeitados;
--   · autorização dupla (client_id do agente, token da agenda pública) e
--     cliente errado leva 42501, não linha alheia;
--   · o trinco: anon e authenticated NÃO executam nenhuma das três.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(30);

\set salao    'ee017600-0000-0000-0000-000000000001'
\set barbeiro 'ee017601-0000-0000-0000-000000000001'
\set corte    'ee017602-0000-0000-0000-000000000001'
\set barba    'ee017602-0000-0000-0000-000000000002'
\set sobranc  'ee017602-0000-0000-0000-000000000003'
\set fora     'ee017602-0000-0000-0000-000000000004'
\set morto    'ee017602-0000-0000-0000-000000000005'
\set saiu     'ee017604-0000-0000-0000-000000000005'
\set cli      'ee017603-0000-0000-0000-000000000001'
\set cli2     'ee017603-0000-0000-0000-000000000002'
\set cli3     'ee017603-0000-0000-0000-000000000003'
\set ag1      'ee017604-0000-0000-0000-000000000001'
\set ag2      'ee017604-0000-0000-0000-000000000002'
\set tarde    'ee017604-0000-0000-0000-000000000003'
\set perto    'ee017604-0000-0000-0000-000000000004'

-- "Amanhã" NO RELÓGIO DE SÃO PAULO (lição do PR #167: o runner vive em UTC e
-- entre 21h e meia-noite os relógios divergem de um dia).
create function pg_temp.amanha_sp(h time) returns timestamptz
language sql as $$
  select (((now() at time zone 'America/Sao_Paulo')::date + 1) + h) at time zone 'America/Sao_Paulo'
$$;
-- A chave do horário de funcionamento para o dia de amanhã ('seg'...'dom').
create function pg_temp.chave_amanha() returns text
language sql as $$
  select case extract(dow from (now() at time zone 'America/Sao_Paulo')::date + 1)
           when 0 then 'dom' when 1 then 'seg' when 2 then 'ter'
           when 3 then 'qua' when 4 then 'qui' when 5 then 'sex'
           else 'sab' end
$$;

insert into salons (id, nome, ativo, horario_funcionamento)
values (:'salao', 'Mexe Certo', true,
        jsonb_build_object(pg_temp.chave_amanha(), jsonb_build_object('abre','08:00','fecha','20:00')));
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Rafa', true);
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values (:'barbeiro', extract(dow from (now() at time zone 'America/Sao_Paulo')::date + 1)::int,
        time '08:00', time '20:00', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',   :'salao', 'Corte',       40, 45, true),
  (:'barba',   :'salao', 'Barba',       30, 30, true),
  (:'sobranc', :'salao', 'Sobrancelha', 15, 15, true),
  -- Os dois que saíram do cardápio (0177): um JÁ está num agendamento, o
  -- outro não está em lugar nenhum.
  (:'fora',    :'salao', 'Corte antigo',  40, 45, false),
  (:'morto',   :'salao', 'Servico morto', 20, 20, false);
insert into clients (id, salon_id, nome, telefone) values
  (:'cli',  :'salao', 'Fulano',   '41988880001'),
  (:'cli2', :'salao', 'Beltrano', '41988880002'),
  (:'cli3', :'salao', 'Sicrano',  '41988880003');

-- O agendamento da história: amanhã às 10:00, só o corte (10:00–10:40).
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'ag1', :'salao', :'cli', :'barbeiro', :'corte', pg_temp.amanha_sp(time '10:00'), 'agendado', 'agente');

-- ── Alterar serviços ────────────────────────────────────────────────────────

select ok(
  (alterar_servicos_pelo_cliente(:'ag1', array[:'corte', :'barba']::uuid[], :'cli', null)->>'ok')::boolean,
  'a barba entra no agendamento do corte');
select is(
  (select data_hora_fim from appointments where id = :'ag1'),
  pg_temp.amanha_sp(time '11:10'),
  'o fim esticou para cobrir corte + barba (70min)');
select is(
  (select count(*)::int from appointment_services where appointment_id = :'ag1'),
  2, 'as duas linhas de servico estao na filha');

-- Um vizinho cola às 11:10; a sobrancelha (15min) não cabe mais.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'ag2', :'salao', :'cli2', :'barbeiro', :'corte', pg_temp.amanha_sp(time '11:10'), 'agendado', 'publico');

select ok(
  not (alterar_servicos_pelo_cliente(:'ag1', array[:'corte', :'barba', :'sobranc']::uuid[], :'cli', null)->>'ok')::boolean,
  'com o vizinho colado, a sobrancelha e recusada');
-- `ok(... like ...)` e nao o `like()` do pgTAP: `like` e palavra reservada
-- (licao do teste da 0172 — o arquivo morre no meio e leva o plano junto).
select ok(
  alterar_servicos_pelo_cliente(:'ag1', array[:'corte', :'barba', :'sobranc']::uuid[], :'cli', null)->>'motivo'
    like '%nao cabe%', 'o motivo explica que nao cabe');
select is(
  (select count(*)::int from appointment_services where appointment_id = :'ag1'),
  2, 'a recusa nao deixou rastro nas filhas');
select is(
  (select data_hora_fim from appointments where id = :'ag1'),
  pg_temp.amanha_sp(time '11:10'),
  'a recusa nao mexeu no fim');

-- Fim do expediente: 19:20–20:00; +barba iria até 20:30.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, data_hora_fim, status, origem)
values (:'tarde', :'salao', :'cli3', :'barbeiro', :'corte',
        pg_temp.amanha_sp(time '19:20'), pg_temp.amanha_sp(time '20:00'), 'agendado', 'crm');
select ok(
  not (alterar_servicos_pelo_cliente(:'tarde', array[:'corte', :'barba']::uuid[], :'cli3', null)->>'ok')::boolean,
  'esticar alem da jornada e recusado');
select ok(
  alterar_servicos_pelo_cliente(:'tarde', array[:'corte', :'barba']::uuid[], :'cli3', null)->>'motivo'
    like '%expediente%', 'o motivo fala do expediente');

-- O piso de 30 minutos (o horário é daqui a 10).
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, data_hora_fim, status, origem)
values (:'perto', :'salao', :'cli3', :'barbeiro', :'corte',
        now() + interval '10 minutes', now() + interval '50 minutes', 'agendado', 'crm');
select ok(
  not (alterar_servicos_pelo_cliente(:'perto', array[:'corte', :'barba']::uuid[], :'cli3', null)->>'ok')::boolean,
  'a menos de 30 minutos nao se mexe');
select ok(
  alterar_servicos_pelo_cliente(:'perto', array[:'corte', :'barba']::uuid[], :'cli3', null)->>'motivo'
    like '%30 minutos%', 'o motivo cita o piso');

-- Autorização: cliente errado não é "recusa", é porta fechada.
select throws_ok(
  format($$select alterar_servicos_pelo_cliente(%L, array[%L]::uuid[], %L, null)$$,
         'ee017604-0000-0000-0000-000000000001'::uuid,
         'ee017602-0000-0000-0000-000000000001'::uuid,
         'ee017603-0000-0000-0000-000000000002'::uuid),
  '42501', null, 'cliente errado leva 42501');

-- O token de gestão autoriza sozinho (a porta da agenda pública).
select ok(
  (alterar_servicos_pelo_cliente(:'ag1', array[:'corte', :'barba']::uuid[], null,
     (select token_gestao from appointments where id = :'ag1'))->>'ok')::boolean,
  'o token de gestao autoriza sem client_id');

-- ── Remarcar ────────────────────────────────────────────────────────────────

select ok(
  (remarcar_pelo_cliente(:'ag1', pg_temp.amanha_sp(time '14:00'), :'cli', null)->>'ok')::boolean,
  'remarcar para um horario livre funciona');
select is(
  (select data_hora_inicio from appointments where id = :'ag1'),
  pg_temp.amanha_sp(time '14:00'), 'o inicio mudou de verdade');
select is(
  (select status from appointments where id = :'ag1'),
  'agendado', 'status volta a agendado (a presenca confirmada era da hora antiga)');
select ok(
  (select remarcado_pelo_cliente_em is not null from appointments where id = :'ag1'),
  'o carimbo de remarcado pelo cliente foi gravado');

select ok(
  not (remarcar_pelo_cliente(:'ag1', pg_temp.amanha_sp(time '11:10'), :'cli', null)->>'ok')::boolean,
  'remarcar para cima do vizinho e recusado');
select ok(
  (remarcar_pelo_cliente(:'ag1', pg_temp.amanha_sp(time '11:10'), :'cli', null)) ? 'sugestoes_no_dia',
  'a recusa traz sugestoes do dia');

-- ── Criar pelo agente ───────────────────────────────────────────────────────

select ok(
  (agendar_pelo_agente(:'salao', :'cli2', :'barbeiro', array[:'corte', :'barba']::uuid[],
                       pg_temp.amanha_sp(time '16:00'))->>'ok')::boolean,
  'o agente cria com dois servicos de uma vez');
select is(
  (select count(*)::int from appointment_services asv
    join appointments a on a.id = asv.appointment_id
   where a.client_id = :'cli2' and a.data_hora_inicio = pg_temp.amanha_sp(time '16:00')),
  2, 'as duas linhas de servico entraram');
select is(
  (select origem from appointments
    where client_id = :'cli2' and data_hora_inicio = pg_temp.amanha_sp(time '16:00')),
  'agente', 'a origem e do agente');

select ok(
  not (agendar_pelo_agente(:'salao', :'cli3', :'barbeiro', array[:'corte']::uuid[],
                           pg_temp.amanha_sp(time '16:00'))->>'ok')::boolean,
  'o mesmo horario para outro cliente e recusado');

select throws_ok(
  format($$select agendar_pelo_agente(%L, %L, %L, array[%L]::uuid[], pg_temp.amanha_sp(time '17:00'))$$,
         'ee017600-0000-0000-0000-000000000001'::uuid,
         gen_random_uuid(),
         'ee017601-0000-0000-0000-000000000001'::uuid,
         'ee017602-0000-0000-0000-000000000001'::uuid),
  '42501', null, 'cliente de fora do salao leva 42501');

-- ── O que saiu do cardápio (0177) ───────────────────────────────────────────
-- A barbearia inativou um serviço que já tinha horário marcado. O cliente
-- continua podendo MEXER (manter o que tinha + somar), mas ninguém acrescenta
-- o que saiu. Antes da 0177 o primeiro caso estourava 22023 e virava um 500
-- genérico na cara de quem só queria a sobrancelha.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, data_hora_fim, status, origem)
values (:'saiu', :'salao', :'cli3', :'barbeiro', :'fora',
        pg_temp.amanha_sp(time '09:00'), pg_temp.amanha_sp(time '09:40'), 'agendado', 'publico');

select ok(
  (alterar_servicos_pelo_cliente(:'saiu', array[:'fora', :'sobranc']::uuid[], :'cli3', null)->>'ok')::boolean,
  'o servico fora do cardapio pode ser MANTIDO ao somar outro');
select throws_ok(
  format($$select alterar_servicos_pelo_cliente(%L, array[%L,%L]::uuid[], %L, null)$$,
         'ee017604-0000-0000-0000-000000000005'::uuid,
         'ee017602-0000-0000-0000-000000000004'::uuid,
         'ee017602-0000-0000-0000-000000000005'::uuid,
         'ee017603-0000-0000-0000-000000000003'::uuid),
  '22023', null, 'acrescentar servico fora do cardapio continua barrado');

-- ── O trinco ────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.alterar_servicos_pelo_cliente(uuid,uuid[],uuid,uuid)', 'execute'),
  'anon nao executa alterar_servicos_pelo_cliente');
select ok(
  not has_function_privilege('authenticated', 'public.remarcar_pelo_cliente(uuid,timestamptz,uuid,uuid)', 'execute'),
  'authenticated nao executa remarcar_pelo_cliente');
select ok(
  not has_function_privilege('anon', 'public.agendar_pelo_agente(uuid,uuid,uuid,uuid[],timestamptz)', 'execute'),
  'anon nao executa agendar_pelo_agente');
select ok(
  has_function_privilege('service_role', 'public.alterar_servicos_pelo_cliente(uuid,uuid[],uuid,uuid)', 'execute'),
  'service_role executa (as duas portas passam por servidor)');

select * from finish();
rollback;
