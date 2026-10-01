-- A vaga segurada para quem foi chamado (migration 0192).
--
-- ## O que este teste existe para impedir
--
-- A fila de espera chama alguém — "abriu sábado 9h30, quer?" — e a vaga tem de
-- parar de ser oferecida **enquanto ele pensa**. Se ela continuar aparecendo, o
-- cliente responde "quero" três minutos depois e encontra ocupado: o mesmo muro
-- que a agenda pública nos ensinou a não construir.
--
-- A reserva funciona porque é uma linha de AGENDAMENTO com status `reservado`, e
-- a trava de sobreposição e o `horarios_livres` filtram pela mesma régua
-- (`status not in ('cancelado','faltou')`). O dia em que alguém trocar essa
-- régua por uma lista branca de status, a vaga volta a ser oferecida duas vezes
-- e **a asserção 4 cai aqui**, não na cara de dois clientes.
--
-- Fixture no relógio de São Paulo, nunca `current_date`: o runner do CI vive em
-- UTC e o teste passaria de dia e quebraria de madrugada.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(10);

\set salao   'aaaa1920-0000-0000-0000-000000000001'
\set prof    'aaaa1921-0000-0000-0000-000000000001'
\set servico 'aaaa1922-0000-0000-0000-000000000001'
\set cliente 'aaaa1923-0000-0000-0000-000000000001'
\set outro   'aaaa1923-0000-0000-0000-000000000002'
\set reserva 'aaaa1924-0000-0000-0000-000000000001'

create or replace function pg_temp.dia() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $fn$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $fn$ select (pg_temp.dia()::text || ' ' || h)::timestamp
                            at time zone 'America/Sao_Paulo' $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia da Fila', true, 10,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','09:00','fecha','18:00'),
          'seg', jsonb_build_object('abre','09:00','fecha','18:00'),
          'ter', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qua', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qui', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sex', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sab', jsonb_build_object('abre','09:00','fecha','18:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof', :'salao', 'Cadeira Unica', true);

-- A jornada é o denominador de `horarios_livres`: sem ela a função não devolve
-- linha e as asserções de vaga passariam por vazio. `values`, e não
-- `insert ... select`: em `values` o literal do psql chega como `unknown` e é
-- convertido pela coluna de destino.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values (:'prof', extract(dow from pg_temp.dia())::smallint, '09:00', '18:00', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 30, 50, true);

insert into clients (id, salon_id, nome, telefone) values
  (:'cliente', :'salao', 'Quem Esperava', '41977770021');
insert into clients (id, salon_id, nome, telefone) values
  (:'outro', :'salao', 'Quem Chegou Depois', '41977770022');

------------------------------------------------------------- 1. a reserva nasce

select lives_ok(
  format($q$insert into appointments
              (id, salon_id, client_id, professional_id, service_id,
               data_hora_inicio, status, origem, reservada_ate)
            values (%L, %L, %L, %L, %L, %L, 'reservado', 'fila', now() + interval '30 minutes')$q$,
         :'reserva', :'salao', :'cliente', :'prof', :'servico', pg_temp.em('10:00')),
  'a vaga pode ser reservada: status `reservado` e origem `fila` existem'
);

----------------------------------------------- 2 e 3. os dois lados do CHECK

-- Reserva sem prazo seguraria a vaga para sempre, porque nada a venceria.
select throws_ok(
  format($q$update appointments set reservada_ate = null where id = %L$q$, :'reserva'),
  '23514', null,
  'reserva SEM prazo e recusada: senao a vaga ficaria segurada para sempre'
);

-- Prazo em agendamento de verdade é prazo que ninguém lê, esperando para
-- confundir quem vier depois.
select throws_ok(
  format($q$insert into appointments
              (salon_id, client_id, professional_id, service_id,
               data_hora_inicio, status, origem, reservada_ate)
            values (%L, %L, %L, %L, %L, 'agendado', 'crm', now() + interval '1 hour')$q$,
         :'salao', :'cliente', :'prof', :'servico', pg_temp.em('14:00')),
  '23514', null,
  'agendamento comum NAO aceita prazo de reserva'
);

------------------------------------- 4. a vaga reservada sai de circulacao

-- A asserção que sustenta a funcionalidade inteira.
select ok(
  not exists (
    select 1 from horarios_livres(:'salao', pg_temp.dia(), 30, :'prof')
     where inicio = pg_temp.em('10:00')
  ),
  'a vaga RESERVADA deixa de ser oferecida pelo horarios_livres'
);

------------------------------------------ 5. e ninguem marca em cima dela

select throws_ok(
  format($q$insert into appointments
              (salon_id, client_id, professional_id, service_id,
               data_hora_inicio, status, origem)
            values (%L, %L, %L, %L, %L, 'agendado', 'crm')$q$,
         :'salao', :'outro', :'prof', :'servico', pg_temp.em('10:00')),
  '23P01', null,
  'a trava de sobreposicao impede marcar em cima da reserva'
);

--------------------------------------------- 6 e 7. a varredura das vencidas

select is(
  private.expirar_reservas(),
  0,
  'a varredura NAO toca em reserva dentro do prazo'
);

-- Vence a reserva e varre. A vaga tem de voltar: é o que faz a fila poder
-- chamar o próximo quando o primeiro não responde.
update appointments set reservada_ate = now() - interval '1 minute' where id = :'reserva';

-- A varredura roda numa instrução SÓ, e o resultado fica guardado.
--
-- A primeira versão deste teste juntava a chamada e as duas consequências num
-- `and` único — `expirar_reservas() = 1 and not exists(...) and exists(...)` — e
-- falhou. SQL **não garante a ordem de avaliação** de um `and`: o `not exists`
-- podia ser medido antes de a varredura apagar a linha. Asserção que depende de
-- efeito colateral da própria expressão é asserção que decide no sorteio.
create temp table varredura as select private.expirar_reservas() as apagadas;

select is(
  (select apagadas from varredura),
  1,
  'a varredura apaga exatamente a reserva vencida'
);

select ok(
  not exists (select 1 from appointments where id = :'reserva'),
  'a linha da reserva e APAGADA, nao cancelada: nada de desistencia inventada'
);

select ok(
  exists (
    select 1 from horarios_livres(:'salao', pg_temp.dia(), 30, :'prof')
     where inicio = pg_temp.em('10:00')
  ),
  'e a vaga volta a ser oferecida, para a fila poder chamar o proximo'
);

--------------------------------------------------------------- 8. o trinco

select ok(
  not has_function_privilege('anon', 'private.expirar_reservas()', 'execute')
  and not has_function_privilege('authenticated', 'private.expirar_reservas()', 'execute')
  and has_function_privilege('service_role', 'private.expirar_reservas()', 'execute'),
  'so o service_role varre: a funcao nova nao ficou com execute para todos'
);

select * from finish();
rollback;
