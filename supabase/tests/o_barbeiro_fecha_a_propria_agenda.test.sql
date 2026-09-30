-- O barbeiro fecha a própria agenda (migration 0182).
--
-- O status `bloqueio` já existia no CHECK e no CRM; o que faltava era poder
-- criar um. Abrir a porta não exigiu regra nova -- a trava de exclusão do banco
-- já recusa agendamento em cima de qualquer linha que não seja cancelada ou
-- falta, e `bloqueio` nunca esteve nessa isenção.
--
-- O que exigiu migration foi a FOLGA, e é o que este teste guarda: o bloqueio
-- ocupa a cadeira mas **não deve folga**, porque a folga existe para o barbeiro
-- respirar entre dois clientes e o bloqueio já é a respiração. Sem isso, o
-- primeiro bloqueio que ele tentasse (almoço às 12h, corte terminando às 12h,
-- folga de 10) era recusado com uma frase que soa como defeito do sistema.
--
-- A régua vale nos dois lados da casa, e as asserções vêm em pares por isso: o
-- que o GATILHO deixa entrar e o que `horarios_livres` mostra ao cliente. Se um
-- dia só uma das duas for afrouxada, é aqui que aparece -- foi exatamente esse
-- desencontro (CRM aceitando 13:00, link público escondendo até 13:10) que a
-- migration existiu para evitar.
--
-- As duas cadeiras têm papéis separados de propósito: a **A** prova o que mudou
-- (bloqueio), a **B** prova o que NÃO podia mudar (a folga entre dois
-- atendimentos de verdade, no gatilho e na vitrine). Medir as duas coisas na
-- mesma cadeira daria asserção cega -- um horário coberto pelo bloqueio some da
-- lista com ou sem a correção, e passaria verde pelo motivo errado.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set salao   'dddd9000-0000-0000-0000-000000000001'
\set prof_a  'dddd9100-0000-0000-0000-000000000001'
\set prof_b  'dddd9100-0000-0000-0000-000000000002'
\set servico 'dddd9200-0000-0000-0000-000000000001'
\set cliente 'dddd9300-0000-0000-0000-000000000001'
\set almoco  'dddd9400-0000-0000-0000-000000000001'

-- O runner do CI vive em UTC; a fixture vive no relógio da barbearia. Usar
-- `current_date` aqui faz o teste passar de dia e quebrar de madrugada.
create or replace function pg_temp.dia() returns date
language sql as $$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $$ select (pg_temp.dia()::text || ' ' || h)::timestamp
                          at time zone 'America/Sao_Paulo' $$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Fecha a Propria Agenda', true, 10,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','09:00','fecha','18:00'),
          'seg', jsonb_build_object('abre','09:00','fecha','18:00'),
          'ter', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qua', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qui', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sex', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sab', jsonb_build_object('abre','09:00','fecha','18:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof_a', :'salao', 'Cadeira A', true),
  (:'prof_b', :'salao', 'Cadeira B', true);

-- A jornada é o denominador de `horarios_livres`: sem ela a função não devolve
-- linha nenhuma, e as asserções de vaga passariam por vazio.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'prof_a', extract(dow from pg_temp.dia())::smallint, '09:00'::time, '18:00'::time, true
union all
select :'prof_b', extract(dow from pg_temp.dia())::smallint, '09:00'::time, '18:00'::time, true;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 30, 50, true);

insert into clients (id, salon_id, nome, telefone)
values (:'cliente', :'salao', 'Cliente Um', '41977770009');

-- Cadeira A: atendimento de verdade das 11:30 às 12:00.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem)
values (:'salao', :'cliente', :'prof_a', :'servico', pg_temp.em('11:30'), 'agendado', 'crm');

-- Cadeira B: atendimento de verdade das 15:00 às 15:30. É a testemunha de que a
-- folga original continua inteira.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem)
values (:'salao', :'cliente', :'prof_b', :'servico', pg_temp.em('15:00'), 'agendado', 'crm');

------------------------------------------------- 1. o bloqueio consegue nascer

select lives_ok(
  format($$insert into appointments (id, salon_id, professional_id, data_hora_inicio,
                                     data_hora_fim, status, origem, motivo_do_bloqueio)
           values (%L, %L, %L, pg_temp.em('12:00'), pg_temp.em('13:00'),
                   'bloqueio', 'crm', 'Almoco')$$,
         :'almoco', :'salao', :'prof_a'),
  'bloqueio encostado no fim do atendimento entra: ele nao deve folga a ninguem'
);

--------------------------- 2-3. o que o cliente enxerga em volta do bloqueio
-- Antes de ocupar as 13:00, senão a asserção seguinte mediria a própria
-- fixture em vez da régra.

select is(
  (select count(*)::int from horarios_livres(:'salao'::uuid, pg_temp.dia(), 30, :'prof_a'::uuid)
    where hora_local = '12:30'),
  0,
  '12:30 esta dentro do bloqueio: nao e oferecido ao cliente'
);

select is(
  (select count(*)::int from horarios_livres(:'salao'::uuid, pg_temp.dia(), 30, :'prof_a'::uuid)
    where hora_local = '13:00'),
  1,
  '13:00 encosta no fim do bloqueio e E oferecido: nao se deve descanso a quem nao estava aqui'
);

------------------------------------------- 4-5. e o gatilho concorda com ela

select lives_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id,
                                     data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.em('13:00'), 'agendado', 'crm')$$,
         :'salao', :'cliente', :'prof_a', :'servico'),
  'o CRM aceita as 13:00 que a vitrine ofereceu: as duas portas com a mesma regua'
);

select throws_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id,
                                     data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.em('12:20'), 'agendado', 'crm')$$,
         :'salao', :'cliente', :'prof_a', :'servico'),
  '23P01', null,
  'em cima do bloqueio nao entra -- a trava de exclusao, que vale para as tres portas'
);

--------------------------------- 6-8. a cadeira B: nada disso afrouxou a folga

select throws_ok(
  format($$insert into appointments (salon_id, professional_id, service_id,
                                     data_hora_inicio, status, origem)
           values (%L, %L, %L, pg_temp.em('15:35'), 'agendado', 'crm')$$,
         :'salao', :'prof_b', :'servico'),
  '23P01', null,
  'dois atendimentos a 5 minutos: a folga de verdade sobreviveu no gatilho'
);

select is(
  (select count(*)::int from horarios_livres(:'salao'::uuid, pg_temp.dia(), 30, :'prof_b'::uuid)
    where hora_local = '15:30'),
  0,
  '15:30 encosta no atendimento das 15:00: a folga de verdade sobreviveu na vitrine'
);

select is(
  (select count(*)::int from horarios_livres(:'salao'::uuid, pg_temp.dia(), 30, :'prof_b'::uuid)
    where hora_local = '15:40'),
  1,
  '15:40 reabre exatamente ao fim da folga: ela nao virou zero para todo mundo'
);

---------------------------------------------------- 9-11. a forma da linha

select is(
  (select count(*)::int from appointments
    where id = :'almoco' and client_id is null and service_id is null
      and motivo_do_bloqueio = 'Almoco'),
  1,
  'o bloqueio e uma linha sem cliente e sem servico, com o motivo escrito'
);

select is(
  (select count(*)::int from appointment_services where appointment_id = :'almoco'),
  0,
  'o gatilho que espelha o servico principal nao inventou item para o bloqueio'
);

select throws_ok(
  format($$insert into appointments (salon_id, professional_id, data_hora_inicio,
                                     data_hora_fim, status, origem, motivo_do_bloqueio)
           values (%L, %L, pg_temp.em('16:30'), pg_temp.em('17:00'),
                   'bloqueio', 'crm', repeat('x', 61))$$,
         :'salao', :'prof_b'),
  '23514', null,
  'motivo acima de 60 caracteres e recusado: a agenda nao comporta paragrafo'
);

select * from finish();
rollback;
