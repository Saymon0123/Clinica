-- A fila que chama (migration 0205).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 3 é o coração**: a reserva nasce com a duração SOMADA dos
-- serviços da inscrição. A primeira versão da função deixava o trigger
-- `calcula_fim_do_agendamento` derivar o fim do serviço PRINCIPAL -- a vaga era
-- validada para corte+barba (70 min) e a reserva nascia de 40, liberando meia
-- hora que não existe para a próxima pessoa da fila. Peguei medindo, não lendo.
--
-- **A asserção 6 guarda a ordem dos três passos** de `rodar_a_fila`. Sem
-- devolver quem não respondeu ANTES de chamar, uma inscrição em `chamado` nunca
-- mais seria olhada -- a que chama só enxerga `esperando` --, e a pessoa ficaria
-- presa na fila para sempre sem saber por quê.
--
-- E a **asserção 1** guarda a recusa na porta: pedir "o Thiago, para platinado"
-- quando o Thiago não faz platinado criaria uma inscrição que nunca casa com
-- nada e fica esperando até vencer, com a pessoa olhando um telefone que não vai
-- tocar.
--
-- A fixture é a mesma forma que já passou no CI em `a_fila_de_espera.test.sql`:
-- jornada nos sete dias e barbearia aberta todos os dias, porque supor "amanhã
-- tem vaga" caiu num domingo fechado no ensaio em produção.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(12);

\set salao   'aaaa2400-0000-0000-0000-000000000001'
\set prof    'aaaa2401-0000-0000-0000-000000000001'
\set so_faz_barba 'aaaa2401-0000-0000-0000-000000000002'
\set corte   'aaaa2402-0000-0000-0000-000000000001'
\set barba   'aaaa2402-0000-0000-0000-000000000002'
\set quimica 'aaaa2402-0000-0000-0000-000000000003'
\set c1      'aaaa2403-0000-0000-0000-000000000001'
\set c2      'aaaa2403-0000-0000-0000-000000000002'
\set c3      'aaaa2403-0000-0000-0000-000000000003'

create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia da Fila', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof', :'salao', 'Quem Atende', true),
  (:'so_faz_barba', :'salao', 'So Faz Barba', true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'prof', d, '08:00', '20:00', true from generate_series(0, 6) d;
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'so_faz_barba', d, '08:00', '20:00', true from generate_series(0, 6) d;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',   :'salao', 'Corte',   40, 50,  true),
  (:'barba',   :'salao', 'Barba',   30, 40,  true),
  (:'quimica', :'salao', 'Quimica', 60, 200, true);

-- `prof` faz corte e barba; `so_faz_barba` faz so barba. NINGUEM faz quimica --
-- e esse e o caso da assercao 7.
insert into professional_services (professional_id, service_id) values
  (:'prof', :'corte'), (:'prof', :'barba'),
  (:'so_faz_barba', :'barba');

insert into clients (id, salon_id, nome, telefone) values
  (:'c1', :'salao', 'Primeiro da Fila', '41977770051'),
  (:'c2', :'salao', 'Segundo da Fila',  '41977770052'),
  (:'c3', :'salao', 'Terceiro da Fila', '41977770053');

------------------- 1. a inscricao impossivel se recusa na PORTA

select is(
  (entrar_na_fila(:'salao', :'c1', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6,
                  null, null, :'so_faz_barba')->>'motivo'),
  'Esse barbeiro nao faz esse servico. Pode ser com outro?',
  'pedir barbeiro que nao faz o servico e recusado na entrada, nao na chamada'
);

--------------------------- 2 a 4. a chamada, e a duracao somada

select ok(
  (entrar_na_fila(:'salao', :'c1', array[:'corte'::uuid, :'barba'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'entra na fila esperando corte + barba'
);

-- A chamada roda numa instrucao SO, e o resultado fica guardado: `and` em SQL
-- nao garante ordem de avaliacao, e misturar a chamada com a consequencia ja
-- reprovou no CI uma vez (e esta escrito duas vezes no repositorio por isso).
create temp table tique as select rodar_a_fila(10) as r;

select is(
  (select jsonb_array_length((select r from tique)->'chamadas')),
  1,
  'o tique da fila chama exatamente uma pessoa'
);

select is(
  (select (extract(epoch from (a.data_hora_fim - a.data_hora_inicio)) / 60)::int
     from appointments a
     join fila_de_espera f on f.appointment_id = a.id
    where f.client_id = :'c1'),
  70,
  'a reserva nasce com a duracao SOMADA (corte 40 + barba 30), nao a do servico principal'
);

select is(
  (select count(*)::int from appointment_services s
     join fila_de_espera f on f.appointment_id = s.appointment_id
    where f.client_id = :'c1'),
  2,
  'e os DOIS servicos vao para a reserva'
);

------------- 5 e 6. chamada sem resposta: volta, e na segunda encerra

-- A varredura APAGA a reserva vencida; a FK e on delete set null, entao a
-- inscricao fica `chamado` com appointment_id nulo -- que e o sinal.
update appointments set reservada_ate = now() - interval '1 minute'
 where id = (select appointment_id from fila_de_espera where client_id = :'c1');

create temp table varrido as select private.expirar_reservas() as apagadas;

select is(
  (select status || '/' || coalesce(appointment_id::text, 'sem reserva')
     from fila_de_espera where client_id = :'c1'),
  'chamado/sem reserva',
  'depois da varredura a inscricao fica chamado SEM reserva: e assim que se sabe que ninguem respondeu'
);

create temp table devolvido as select private.devolver_chamados_sem_resposta() as n;

select is(
  (select status || '/' || chamadas from fila_de_espera where client_id = :'c1'),
  'esperando/1',
  'quem nao respondeu volta para a fila com chamadas+1 -- a primeira perdida nao despeja ninguem'
);

update fila_de_espera set status = 'chamado', appointment_id = null
 where client_id = :'c1';

create temp table devolvido2 as select private.devolver_chamados_sem_resposta() as n;

select is(
  (select status || '/' || chamadas from fila_de_espera where client_id = :'c1'),
  'expirou/2',
  'a SEGUNDA chamada sem resposta encerra: chamar para sempre e spam'
);

------------------------------- 7. ninguem faz o servico: ninguem e chamado

select ok(
  (entrar_na_fila(:'salao', :'c2', array[:'quimica'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'entra na fila esperando um servico que nenhum barbeiro faz (sem barbeiro escolhido, entra)'
);

create temp table tique2 as select rodar_a_fila(10) as r;

select is(
  (select status from fila_de_espera where client_id = :'c2'),
  'esperando',
  'e NAO e chamada: ninguem faz esse servico, entao ela espera em vez de virar reserva impossivel'
);

----------------------------------------------- 8. inscricao vencida encerra

insert into fila_de_espera (salon_id, client_id, de, ate)
values (:'salao', :'c3', pg_temp.hoje() - 5, pg_temp.hoje() - 1);

create temp table tique3 as select rodar_a_fila(10) as r;

select is(
  (select status from fila_de_espera where client_id = :'c3'),
  'expirou',
  'inscricao cuja faixa de dias ja passou e encerrada pelo proprio tique'
);

--------------------------------------------------------------- 12. o trinco

select ok(
  not has_function_privilege('anon', 'public.rodar_a_fila(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.rodar_a_fila(integer)', 'execute')
  and has_function_privilege('service_role', 'public.rodar_a_fila(integer)', 'execute')
  and not has_function_privilege('authenticated',
        'private.chamar_proximos_da_fila(integer,integer)', 'execute'),
  'so o service_role roda o tique da fila: nem anon nem a tela do dono chamam isto'
);

select * from finish();
rollback;
