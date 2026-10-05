-- A folga que não colide (migration 0213).
--
-- ## O que este teste existe para impedir
--
-- **As asserções 1 e 2 são um par, e juntas são o teste inteiro.** A 2 prova que
-- o bloqueio de dia inteiro é recusado com 23P01 quando há agendamento no
-- caminho — ele É um agendamento, e a EXCLUDE `appointments_sem_sobreposicao`
-- separa agendamentos por definição. A 1 prova que a folga entra no MESMO dia,
-- com os MESMOS dois agendamentos de pé. É por isso que a folga é uma tabela e
-- não mais um status: ela precisa conviver com o que já está marcado.
--
-- Se alguém algum dia "simplificar" a folga para um agendamento de dia inteiro,
-- a 1 cai — e a mensagem dirá por quê.
--
-- **A asserção 3 existe porque a 4 sozinha não mede nada.** Em 03/10 uma
-- asserção minha de expiração passou medindo zero: o estado que ela queria
-- observar nunca acontecia. Aqui, "zero vagas depois da folga" só significa algo
-- se havia vaga antes — então a 3 mede o antes, e no mesmo dia e barbeiro.
--
-- **A asserção 8 guarda a herança.** `dias_com_horario` (a faixa de catorze dias
-- da agenda pública) não repete a regra: ela chama `horarios_livres` 14 vezes. Se
-- alguém duplicar a lógica lá, a faixa passa a oferecer um dia que a grade
-- recusa, e o cliente toca num dia "livre" para achar um beco.
--
-- **A asserção 7 guarda o escopo por data.** A jornada é semanal; a folga é de um
-- dia. Um filtro escrito por `dia_semana` em vez de por data fecharia toda
-- quinta-feira do ano em vez de uma.
--
-- **A 12 é o trinco.** `authenticated` nasce com SETE privilégios nesta tabela
-- pelo padrão do schema, e `TRUNCATE` **ignora RLS** — com ele, um JWT de
-- qualquer salão apagaria a folga de todos. A migration faz `revoke all` antes
-- do `grant` por isso.
--
-- A fixture é a forma que já passou no CI em `a_fila_que_chama.test.sql`:
-- jornada nos sete dias e barbearia aberta todos os dias, porque supor "o dia
-- tem vaga" caiu num domingo fechado num ensaio em produção.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(13);

\set salao 'bbbb0213-0000-0000-0000-000000000001'
\set folga 'bbbb0213-0001-0000-0000-000000000001'
\set fica  'bbbb0213-0001-0000-0000-000000000002'
\set serv  'bbbb0213-0002-0000-0000-000000000001'
\set cli   'bbbb0213-0003-0000-0000-000000000001'

-- O relógio de São Paulo, nunca `current_date`: o runner do CI vive em UTC, e
-- um teste assim passava de dia e quebrava de madrugada.
create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

-- O dia do imprevisto: "hoje é dia 4 e no dia 7 ele não pode trabalhar".
create or replace function pg_temp.dia() returns date
language sql as $fn$ select pg_temp.hoje() + 3 $fn$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $fn$
  select (pg_temp.dia()::text || ' ' || h)::timestamp at time zone 'America/Sao_Paulo'
$fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia do Imprevisto', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'folga', :'salao', 'Quem Tira Folga', true),
  (:'fica',  :'salao', 'Quem Fica',       true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'folga', d, '08:00', '20:00', true from generate_series(0, 6) d;
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'fica', d, '08:00', '20:00', true from generate_series(0, 6) d;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'serv', :'salao', 'Corte', 40, 50, true);
insert into professional_services (professional_id, service_id) values
  (:'folga', :'serv'), (:'fica', :'serv');

insert into clients (id, salon_id, nome, telefone)
values (:'cli', :'salao', 'Cliente do Dia Sete', '41977770213');

-- Os dois agendamentos que o dono teria de resolver com calma.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem)
values (:'salao', :'cli', :'folga', :'serv', pg_temp.em('10:00'), 'agendado', 'crm'),
       (:'salao', :'cli', :'folga', :'serv', pg_temp.em('14:00'), 'agendado', 'crm');

-- 1 e 2: o par que justifica a tabela. A ordem importa -- a 2 tenta o bloqueio
-- ANTES de a folga existir, para medir a recusa pela sobreposição e não por
-- outra coisa.
select throws_ok(
  format($q$insert into appointments
              (salon_id, professional_id, data_hora_inicio, data_hora_fim,
               status, motivo_do_bloqueio)
            values (%L, %L, %L, %L, 'bloqueio', 'Imprevisto')$q$,
         :'salao', :'folga', pg_temp.em('00:00'),
         (pg_temp.dia() + 1)::text || ' 00:00'),
  '23P01', null,
  'o bloqueio de dia inteiro E recusado quando ha agendamento no caminho -- e por isso a folga nao e um agendamento'
);

select lives_ok(
  format($q$insert into dias_de_folga (professional_id, dia, motivo)
            values (%L, %L, 'Imprevisto')$q$, :'folga', pg_temp.dia()),
  'a folga entra no MESMO dia, com os MESMOS dois agendamentos de pe'
);

-- 3 a 8: o que a régua passa a responder.
select ok(
  (select count(*) from horarios_livres(:'salao', pg_temp.hoje() + 4, 40, :'folga')) > 0,
  'a regua oferecia vaga para esse barbeiro num dia sem folga (senao a assercao seguinte nao mediria nada)'
);

select is(
  (select count(*)::int from horarios_livres(:'salao', pg_temp.dia(), 40, :'folga')),
  0,
  'no dia da folga a regua nao oferece NENHUMA vaga desse barbeiro'
);

select ok(
  (select count(*) from horarios_livres(:'salao', pg_temp.dia(), 40, :'fica')) > 0,
  'o outro barbeiro segue oferecendo vaga no mesmo dia -- a folga e de quem a tirou'
);

select is(
  (select count(*)::int from appointments
    where professional_id = :'folga'
      and (data_hora_inicio at time zone 'America/Sao_Paulo')::date = pg_temp.dia()
      and status = 'agendado'),
  2,
  'os dois agendamentos sobreviveram a folga -- ela fecha o dia para novos, nao apaga os existentes'
);

select ok(
  (select count(*) from horarios_livres(:'salao', pg_temp.dia() + 1, 40, :'folga')) > 0,
  'o dia SEGUINTE segue aberto -- a folga e por data, nao por dia da semana'
);

select is(
  (select livres from dias_com_horario(:'salao', pg_temp.dia(), 1, 40, null) limit 1),
  (select count(*)::int from horarios_livres(:'salao', pg_temp.dia(), 40, :'fica')),
  'a faixa de catorze dias herda a mesma regua: no dia da folga ela conta so o outro barbeiro'
);

-- 9 e 10: as travas da tabela.
select throws_ok(
  format($q$insert into dias_de_folga (professional_id, dia) values (%L, %L)$q$,
         :'folga', pg_temp.dia()),
  '23505', null,
  'uma folga por barbeiro por dia -- dois cliques no botao nao viram duas linhas'
);

select throws_ok(
  format($q$insert into dias_de_folga (professional_id, dia, motivo)
            values (%L, %L, %L)$q$,
         :'fica', pg_temp.dia(), repeat('x', 61)),
  '23514', null,
  'motivo acima de 60 e recusado -- o mesmo teto do motivo do bloqueio'
);

-- 11 a 13: o trinco e a RLS.
select ok(
  not has_table_privilege('anon', 'public.dias_de_folga', 'select')
  and not has_table_privilege('anon', 'public.dias_de_folga', 'insert'),
  'anon nao le nem escreve a folga -- tabela nova no public nasce aberta para anon, e cliente nenhum precisa saber quando o barbeiro folga'
);

select ok(
  not has_table_privilege('authenticated', 'public.dias_de_folga', 'truncate'),
  'authenticated NAO tem truncate -- ele ignora RLS, e um JWT de qualquer salao apagaria a folga de todos'
);

select ok(
  (select relrowsecurity from pg_class where relname = 'dias_de_folga'),
  'dias_de_folga esta com RLS ligada'
);

select * from finish();
rollback;
