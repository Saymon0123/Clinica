-- A agenda pública em passos (migration 0218).
--
-- ## O que este teste existe para impedir
--
-- **A 3 e a 4 são o coração**: a regra do "qualquer um" que o dono decidiu
-- em 08/10 -- menos agendamentos no dia, empate por menos minutos. Se alguém
-- inverter a ordem ou trocar a contagem, o barbeiro mais cheio passa a receber
-- mais cliente, e ninguém percebe olhando a tela.
--
-- **A 6 guarda o que o dono pediu para tirar**: o encaixe. A agenda pública é
-- de 30 em 30, e um corte que termina às 11h45 não pode trazer 11h45 de volta
-- para a lista -- é exatamente o horário quebrado que fazia a tela ter 84
-- botões. A 5 prova que o encaixe CONTINUA existindo para quem o usa (o agente).
--
-- **A 9 e a 10 são o defeito corrigido**: quem não faz o serviço não aparece e
-- não é escolhido. A 11 amarra a régua nova à do agente, para as duas portas
-- não divergirem.
--
-- **A 13 é a trava de mudar serviços**, que serve ao link E ao agente.
--
-- Cenário: quatro barbeiros amanhã, das 9h às 18h.
--   Ana    faz corte e quimica   2 agendamentos (60 min)
--   Bruno  faz corte e quimica   1 agendamento  (45 min, termina 11h45)
--   Caio   SEM lista = faz todos 1 agendamento  (60 min)
--   Dino   faz corte e barba     0 agendamentos -- e NAO faz quimica
--
-- Fixture no relógio de São Paulo, nunca `current_date`.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(17);

\set salao   'eeee0218-0000-0000-0000-000000000001'
\set ana     'eeee0218-0001-0000-0000-000000000001'
\set bruno   'eeee0218-0001-0000-0000-000000000002'
\set caio    'eeee0218-0001-0000-0000-000000000003'
\set dino    'eeee0218-0001-0000-0000-000000000004'
\set corte   'eeee0218-0002-0000-0000-000000000001'
\set quimica 'eeee0218-0002-0000-0000-000000000002'
\set barba   'eeee0218-0002-0000-0000-000000000003'
\set cli     'eeee0218-0003-0000-0000-000000000001'
\set ana10   'eeee0218-0004-0000-0000-000000000002'
\set dino15  'eeee0218-0004-0000-0000-000000000009'

create or replace function pg_temp.dia() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $fn$;

-- "amanhã às HH:MI" em São Paulo, como timestamptz.
create or replace function pg_temp.as_(hm text) returns timestamptz
language sql as $fn$
  select (pg_temp.dia() + hm::time) at time zone 'America/Sao_Paulo'
$fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia em Passos', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'ana',   :'salao', 'Ana',   true),
  (:'bruno', :'salao', 'Bruno', true),
  (:'caio',  :'salao', 'Caio',  true),
  (:'dino',  :'salao', 'Dino',  true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select p, extract(dow from pg_temp.dia())::smallint, '09:00', '18:00', true
  from unnest(array[:'ana', :'bruno', :'caio', :'dino']::uuid[]) p;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',   :'salao', 'Corte',   30, 50,  true),
  (:'quimica', :'salao', 'Quimica', 60, 200, true),
  (:'barba',   :'salao', 'Barba',   20, 30,  true);

insert into professional_services (professional_id, service_id) values
  (:'ana',   :'corte'), (:'ana',   :'quimica'),
  (:'bruno', :'corte'), (:'bruno', :'quimica'),
  (:'dino',  :'corte'), (:'dino',  :'barba');

insert into clients (id, salon_id, nome, telefone) values
  (:'cli', :'salao', 'Cliente', '5541977770218');

-- A carga de amanhã. O fim vai explícito: é ele que decide os minutos.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem) values
  ('eeee0218-0004-0000-0000-000000000001', :'salao', :'cli', :'ana', :'corte',
     pg_temp.as_('09:00'), pg_temp.as_('09:30'), 'agendado', 'crm'),
  (:'ana10', :'salao', :'cli', :'ana', :'corte',
     pg_temp.as_('10:00'), pg_temp.as_('10:30'), 'agendado', 'crm'),
  ('eeee0218-0004-0000-0000-000000000003', :'salao', :'cli', :'bruno', :'corte',
     pg_temp.as_('11:00'), pg_temp.as_('11:45'), 'agendado', 'crm'),
  ('eeee0218-0004-0000-0000-000000000004', :'salao', :'cli', :'caio', :'quimica',
     pg_temp.as_('12:00'), pg_temp.as_('13:00'), 'agendado', 'crm'),
  -- Cancelado e bloqueio NAO contam como agendamento do dia.
  ('eeee0218-0004-0000-0000-000000000005', :'salao', :'cli', :'dino', :'corte',
     pg_temp.as_('16:00'), pg_temp.as_('16:30'), 'cancelado', 'crm');
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem) values
  ('eeee0218-0004-0000-0000-000000000006', :'salao', null, :'dino', :'corte',
     pg_temp.as_('17:00'), pg_temp.as_('17:30'), 'bloqueio', 'crm');

------------------------------------------- 1 e 2. a carga que a régua lê

select is(
  (select agendamentos from private.carga_do_dia(:'salao', pg_temp.dia()) where professional_id = :'ana'),
  2,
  'carga: a Ana tem dois agendamentos amanha'
);

select is(
  (select agendamentos from private.carga_do_dia(:'salao', pg_temp.dia()) where professional_id = :'dino'),
  0,
  'carga: cancelado e bloqueio de agenda NAO contam como agendamento'
);

----------------------------------- 3 e 4. O CORAÇÃO: a régua do "qualquer um"

select is(
  (select professional_id from agenda_publica_candidatos(:'salao', pg_temp.as_('14:00'), array[:'corte'::uuid]) limit 1),
  :'dino'::uuid,
  'qualquer um: fica com quem tem MENOS agendamentos no dia'
);

-- Para quimica o Dino nao conta. Bruno e Caio empatam em um agendamento cada;
-- o Bruno tem 45 minutos ocupados, o Caio 60.
select is(
  (select professional_id from agenda_publica_candidatos(:'salao', pg_temp.as_('14:00'), array[:'quimica'::uuid]) limit 1),
  :'bruno'::uuid,
  'qualquer um: empate em agendamentos, fica com quem tem MENOS MINUTOS ocupados'
);

-------------------------------------- 5 e 6. a grade de 30 e o encaixe fora

select ok(
  exists (select 1 from horarios_livres(:'salao', pg_temp.dia(), 30, :'bruno')
           where hora_local = '11:45'),
  -- 11h45 NAO cai na grade de 10 em 10: so existe por causa do encaixe.
  'o encaixe continua existindo para quem usa o padrao (o agente): 11h45 depois do corte do Bruno'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(
      agenda_publica_horarios(:'salao', array[:'corte'::uuid], :'bruno', pg_temp.dia())->'horarios') h
     where h->>'hora_local' = '11:45'),
  'a agenda publica NAO traz o encaixe de volta: 11h45 fica fora da lista'
);

select is(
  (select count(*)::int from jsonb_array_elements(
     agenda_publica_horarios(:'salao', array[:'corte'::uuid], 'qualquer', pg_temp.dia())->'horarios') h
    where right(h->>'hora_local', 2) not in ('00', '30')),
  0,
  'a agenda publica e de 30 em 30: nenhum horario fora de :00 e :30'
);

-------------------- 7. um horário por linha, com quem a régua escolheria

select is(
  (select h->>'professional_id' from jsonb_array_elements(
     agenda_publica_horarios(:'salao', array[:'corte'::uuid], 'qualquer', pg_temp.dia())->'horarios') h
    where h->>'hora_local' = '14:00'),
  :'dino',
  'qualquer um: cada horario aparece UMA vez, com o barbeiro que a regua escolheria'
);

------------------------------------------- 8. o nome que a tela mostrou vale

select is(
  (select professional_id from agenda_publica_candidatos(:'salao', pg_temp.as_('14:00'), array[:'corte'::uuid], :'ana') limit 1),
  :'ana'::uuid,
  'o barbeiro que a tela mostrou, se ainda livre, fica -- mesmo com mais carga'
);

------------------------------------ 9 e 10. O DEFEITO: quem não faz, não entra

select ok(
  not exists (
    select 1 from jsonb_array_elements(
      agenda_publica_horarios(:'salao', array[:'quimica'::uuid])->'barbeiros') b
     where b->>'id' = :'dino'),
  'quem nao faz o servico nao aparece na lista de barbeiros'
);

select is(
  agenda_publica_horarios(:'salao', array[:'quimica'::uuid], :'dino', pg_temp.dia())->>'motivo',
  'Esse barbeiro nao faz esse servico.',
  'pedir de proposito quem nao faz: recusa com motivo, nao lista vazia'
);

-------------------------------- 11. as duas portas concordam em quem faz

select is(
  (select array_agg(x order by x) from unnest(barbeiros_que_fazem_os_servicos(:'salao', array[:'quimica'::uuid])) x),
  (select array_agg((b->>'professional_id')::uuid order by (b->>'professional_id')::uuid)
     from jsonb_array_elements(
       horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])->'barbeiros') b),
  'a regua da agenda publica e a do agente escolhem os MESMOS barbeiros'
);

---------------------------------------------- 12. remarcar não pune o próprio

-- A Ana esta ocupada as 10h com o horario que o cliente quer mover. Ignorando
-- esse horario, ela volta a estar livre as 10h.
select ok(
  exists (select 1 from agenda_publica_candidatos(:'salao', pg_temp.as_('10:00'), array[:'corte'::uuid],
                                                  null, :'ana10')
           where professional_id = :'ana'),
  'remarcar: o horario que esta sendo movido nao ocupa a cadeira dele mesmo'
);

------------------------------------- 13. a trava de mudar serviços (link e agente)

insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem) values
  (:'dino15', :'salao', :'cli', :'dino', :'corte',
     pg_temp.as_('15:00'), pg_temp.as_('15:30'), 'agendado', 'publico');

select is(
  (alterar_servicos_pelo_cliente(:'dino15', array[:'corte'::uuid, :'quimica'::uuid], null,
     (select token_gestao from appointments where id = :'dino15'))->>'motivo'),
  'Dino nao faz Quimica. Para incluir, remarque com outro barbeiro ou fale com a barbearia.',
  'mudar servicos: acrescentar o que o barbeiro nao faz e recusado, com o nome dele'
);

select is(
  (alterar_servicos_pelo_cliente(:'dino15', array[:'corte'::uuid, :'barba'::uuid], null,
     (select token_gestao from appointments where id = :'dino15'))->>'ok'),
  'true',
  'mudar servicos: acrescentar o que ele faz continua passando'
);

-------------------------------------------------------------- 14. o trinco

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'horarios_livres'),
  1,
  'horarios_livres existe UMA vez so: duas versoes tornariam toda chamada ambigua'
);

select ok(
  not has_function_privilege('anon', 'public.agenda_publica_horarios(uuid,uuid[],text,date,integer,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.agenda_publica_horarios(uuid,uuid[],text,date,integer,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.agenda_publica_candidatos(uuid,timestamptz,uuid[],uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.agenda_publica_candidatos(uuid,timestamptz,uuid[],uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.barbeiros_que_fazem_os_servicos(uuid,uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.barbeiros_que_fazem_os_servicos(uuid,uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.horarios_livres(uuid,date,integer,uuid,uuid,integer,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.horarios_livres(uuid,date,integer,uuid,uuid,integer,boolean)', 'execute'),
  'ninguem de fora chama as funcoes novas pelo REST: so o service_role, pela edge'
);

select * from finish();
rollback;
