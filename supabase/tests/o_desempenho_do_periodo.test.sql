-- Os números que dizem se foi um bom período (migration 0183).
--
-- O Financeiro tinha quatro cartões, e os quatro eram contagem ou soma --
-- nenhum era taxa. Esta RPC traz os ingredientes das três taxas do barbeiro:
-- ocupação da cadeira, taxa de retorno e serviços por atendimento.
--
-- Ela devolve INGREDIENTES e não percentuais porque a tela precisa mostrar o
-- denominador: "0,9%" sozinho não diz se a cadeira está vazia ou se a jornada
-- está cadastrada errada. Efeito colateral bom: aqui se compara inteiro exato,
-- e não float arredondado.
--
-- ## O cenário, montado para que cada número prove uma regra
--
-- Ontem, duas cadeiras com jornada das 09:00 às 17:00 (480 min cada):
--
--   Cadeira A: 10:00-11:00 concluído, cliente 1, DOIS serviços
--              11:00-11:30 concluído, cliente 2, um serviço
--              12:00-13:00 BLOQUEIO (almoço)
--              14:00-15:00 CANCELADO, cliente 2
--   Cadeira B: 09:00-10:00 concluído, cliente 1, um serviço
--
-- Daí, para o salão: jornada 960 - 60 de bloqueio = 900; ocupados 150 (o
-- cancelado não entra); 3 atendimentos; 4 serviços; 2 clientes; e 1 que voltou
-- -- o cliente 1, que tem dois horários; o cliente 2 tem um segundo horário,
-- mas CANCELADO, e cancelado não é volta.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(10);

\set salao   'aaaa9000-0000-0000-0000-000000000001'
\set u_dono  'aaaa9500-0000-0000-0000-000000000001'
\set u_barb  'aaaa9500-0000-0000-0000-000000000002'
\set u_fora  'aaaa9500-0000-0000-0000-000000000003'
\set prof_a  'aaaa9100-0000-0000-0000-000000000001'
\set prof_b  'aaaa9100-0000-0000-0000-000000000002'
\set corte   'aaaa9200-0000-0000-0000-000000000001'
\set barba   'aaaa9200-0000-0000-0000-000000000002'
\set cli1    'aaaa9300-0000-0000-0000-000000000001'
\set cli2    'aaaa9300-0000-0000-0000-000000000002'
\set ag1     'aaaa9400-0000-0000-0000-000000000001'

-- ONTEM no relógio de São Paulo. Ontem, e não hoje, porque a janela de jornada
-- é cortada em `now()` de propósito (mês em curso não se mede pelo mês
-- inteiro) -- e com o dia ainda correndo os minutos mudariam a cada execução.
create or replace function pg_temp.dia() returns date
language sql as $$ select ((now() at time zone 'America/Sao_Paulo')::date - 1) $$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $$ select (pg_temp.dia()::text || ' ' || h)::timestamp
                          at time zone 'America/Sao_Paulo' $$;

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

insert into auth.users (id, email) values
  (:'u_dono', 'dono@teste183.local'),
  (:'u_barb', 'barbeiro@teste183.local'),
  (:'u_fora', 'fora@teste183.local');

insert into salons (id, nome, ativo) values (:'salao', 'Desempenho', true);

insert into user_salons (user_id, salon_id, role) values
  (:'u_dono', :'salao', 'owner'),
  (:'u_barb', :'salao', 'barbeiro');

-- O barbeiro tem `user_id`: é por ele que `private.my_professional_ids()` acha
-- a cadeira. A cadeira B não tem dono, para provar que ele não a alcança.
insert into professionals (id, salon_id, nome, ativo, user_id) values
  (:'prof_a', :'salao', 'Cadeira A', true, :'u_barb'),
  (:'prof_b', :'salao', 'Cadeira B', true, null);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values
  (:'prof_a', extract(dow from pg_temp.dia())::smallint, '09:00', '17:00', true),
  (:'prof_b', extract(dow from pg_temp.dia())::smallint, '09:00', '17:00', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte', :'salao', 'Corte', 60, 50, true),
  (:'barba', :'salao', 'Barba', 30, 30, true);

insert into clients (id, salon_id, nome) values
  (:'cli1', :'salao', 'Cliente Um'),
  (:'cli2', :'salao', 'Cliente Dois');

insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values (:'ag1', :'salao', :'cli1', :'prof_a', :'corte',
        pg_temp.em('10:00'), pg_temp.em('11:00'), 'concluido', 'crm');
-- O segundo serviço do mesmo horário (o trigger já pôs o principal).
insert into appointment_services (appointment_id, service_id, ordem)
values (:'ag1', :'barba', 2) on conflict do nothing;

insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values
  (:'salao', :'cli2', :'prof_a', :'barba',
   pg_temp.em('11:00'), pg_temp.em('11:30'), 'concluido', 'crm'),
  (:'salao', :'cli2', :'prof_a', :'corte',
   pg_temp.em('14:00'), pg_temp.em('15:00'), 'cancelado', 'crm'),
  (:'salao', :'cli1', :'prof_b', :'corte',
   pg_temp.em('09:00'), pg_temp.em('10:00'), 'concluido', 'crm');

insert into appointments (salon_id, professional_id, data_hora_inicio, data_hora_fim,
                          status, origem, motivo_do_bloqueio)
values (:'salao', :'prof_a', pg_temp.em('12:00'), pg_temp.em('13:00'),
        'bloqueio', 'crm', 'Almoco');

---------------------------------------------------------------- o gestor

select pg_temp.entrar_como(:'u_dono');

select is(
  (select minutos_jornada from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  900::numeric,
  'jornada: 2 cadeiras x 480 menos os 60 do bloqueio -- quem avisa que sai nao e punido por isso'
);

select is(
  (select minutos_ocupados from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  150::numeric,
  'ocupados: so o que foi concluido -- o cancelado deixou a cadeira vazia, e e essa perda que a taxa mostra'
);

select is(
  (select atendimentos from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  3,
  'tres atendimentos concluidos no salao'
);

select is(
  (select servicos from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  4,
  'quatro servicos em tres atendimentos: o corte+barba conta dois'
);

select is(
  (select clientes from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  2,
  'dois clientes distintos -- o cliente 1 foi atendido duas vezes e conta uma'
);

select is(
  (select clientes_que_voltaram from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  1,
  'so o cliente 1 voltou: o segundo horario do cliente 2 esta CANCELADO, e cancelado nao e volta'
);

select is(
  (select minutos_jornada from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia(), :'prof_b')),
  480::numeric,
  'gestor pedindo a cadeira B recebe a cadeira B: 480 inteiros, porque o bloqueio e da A'
);

--------------------------------------------------------------- o barbeiro

select pg_temp.entrar_como(:'u_barb');

select is(
  (select minutos_jornada from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia(), :'prof_b')),
  420::numeric,
  'barbeiro PEDINDO a cadeira do outro recebe a propria (480-60): o parametro e ignorado, nao recusado'
);

select is(
  (select clientes_que_voltaram from desempenho_do_periodo(:'salao', pg_temp.dia(), pg_temp.dia())),
  0,
  'na cadeira dele ninguem voltou: o outro horario do cliente 1 e ANTERIOR, e cancelado nao conta'
);

------------------------------------------------------------------ de fora

select pg_temp.entrar_como(:'u_fora');

select throws_ok(
  format($$select minutos_jornada from desempenho_do_periodo(%L, %L::date, %L::date)$$,
         :'salao', pg_temp.dia(), pg_temp.dia()),
  '42501', null,
  'quem nao tem vinculo com a barbearia nao le os numeros dela -- a funcao e definer e passa por cima da RLS'
);

select * from finish();
rollback;
