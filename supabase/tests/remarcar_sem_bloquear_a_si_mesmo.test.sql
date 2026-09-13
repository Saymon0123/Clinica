-- Remarcar sem o horário bloquear a si mesmo (migration 0169).
--
-- `horarios_livres` esconde todo horário que colide com um agendamento de pé.
-- Ao REMARCAR, o agendamento que está sendo movido é um deles: quem quisesse
-- sair das 14:00 para as 14:10 não veria as 14:10 na grade, porque ele mesmo
-- estaria bloqueando. `p_ignorar_agendamento` existe para isso.
--
-- E ESTE TESTE PRENDE O TRINCO. A 0169 precisou DERRUBAR e recriar a função —
-- parâmetro novo com padrão vira sobrecarga, e aí toda chamada de quatro
-- argumentos fica ambígua e a agenda pública inteira para. Função recriada
-- nasce com EXECUTE para `public`: se o `revoke` da migration falhar ou sumir
-- num merge, a agenda de qualquer barbearia vira uma chamada REST direta —
-- sem a edge no meio, sem freio de taxa, sem checagem de `salons_atendendo` e
-- sem `recursos_ativos`. Nenhum teste cobria isso antes.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao    'eeee9000-0000-0000-0000-000000000001'
\set barbeiro 'eeee9001-0000-0000-0000-000000000001'
\set servico  'eeee9002-0000-0000-0000-000000000001'
\set cliente  'eeee9003-0000-0000-0000-000000000001'
\set agenda   'eeee9004-0000-0000-0000-000000000001'

-- Aberta todo dia das 09 às 19, e sem folga entre atendimentos: o teste é sobre
-- o parâmetro novo, não sobre a folga.
insert into salons (id, nome, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Remarcar', 0, jsonb_build_object(
  'dom', jsonb_build_object('abre','09:00','fecha','19:00'),
  'seg', jsonb_build_object('abre','09:00','fecha','19:00'),
  'ter', jsonb_build_object('abre','09:00','fecha','19:00'),
  'qua', jsonb_build_object('abre','09:00','fecha','19:00'),
  'qui', jsonb_build_object('abre','09:00','fecha','19:00'),
  'sex', jsonb_build_object('abre','09:00','fecha','19:00'),
  'sab', jsonb_build_object('abre','09:00','fecha','19:00')));

insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Bar', true);

-- Jornada nos sete dias, para o teste não depender do dia em que a CI roda.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'barbeiro', d, time '09:00', time '19:00', true from generate_series(0, 6) d;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
  values (:'servico', :'salao', 'Corte', 30, 40, true);
insert into clients (id, salon_id, nome, telefone)
  values (:'cliente', :'salao', 'Fulano', '41999990000');

-- Um agendamento amanhã às 14:00 (amanhã, e não hoje, porque a função só
-- devolve horários a mais de 10 minutos de agora).
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'agenda', :'salao', :'cliente', :'barbeiro', :'servico',
        ((current_date + 1) + time '14:00') at time zone 'America/Sao_Paulo', 'agendado', 'publico');

-- ── O agendamento bloqueia o próprio horário… ──────────────────────────────
select is(
  (select count(*)::int from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro')
    where hora_local = '14:00'),
  0,
  'sem ignorar, as 14:00 estao ocupadas -- e o comportamento certo para quem esta MARCANDO'
);

select is(
  (select count(*)::int from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro')
    where hora_local = '13:40'),
  0,
  'sem ignorar, as 13:40 tambem somem: um corte de 30 min ali invadiria as 14:00'
);

-- ── …e para de bloquear quando o pedido é justamente movê-lo ───────────────
select is(
  (select count(*)::int from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro', :'agenda')
    where hora_local = '14:00'),
  1,
  'ignorando o proprio agendamento, as 14:00 voltam: remarcar para a mesma hora e um nao-movimento valido'
);

select is(
  (select count(*)::int from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro', :'agenda')
    where hora_local = '14:10'),
  1,
  'ignorando, as 14:10 aparecem -- E O CASO QUE MOTIVOU A 0169: mover dez minutos adiante se autobloqueava'
);

-- ── Ignorar não abre a porta para outros ───────────────────────────────────
select ok(
  (select count(*) from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro', :'agenda'))
  > (select count(*) from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro')),
  'ignorar um agendamento devolve MAIS horarios que nao ignorar nenhum'
);

select is(
  (select count(*)::int from horarios_livres(:'salao', (current_date + 1)::date, 30, :'barbeiro', :'cliente')
    where hora_local = '14:00'),
  0,
  'ignorar um id QUALQUER nao libera o horario: so o proprio agendamento vale'
);

-- ── O trinco ───────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.horarios_livres(uuid,date,integer,uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.horarios_livres(uuid,date,integer,uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.horarios_livres(uuid,date,integer,uuid,uuid)', 'execute'),
  'horarios_livres so e executavel por service_role -- a 0169 derrubou e recriou a funcao, e funcao recriada nasce aberta para public'
);

select ok(
  not has_function_privilege('anon', 'public.dias_com_horario(uuid,date,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.dias_com_horario(uuid,date,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.dias_com_horario(uuid,date,integer,integer)', 'execute'),
  'dias_com_horario idem: sem isto a agenda de catorze dias de qualquer barbearia sai por REST, sem edge no meio'
);

select * from finish();
rollback;
