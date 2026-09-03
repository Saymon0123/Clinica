-- A folga entre atendimentos vale para todo mundo (migration 0134, passo 2.8 — achado 21).
--
-- `folga_entre_atendimentos_minutos` era respeitada só por quem passa por
-- `horarios_livres` (agente e QR); o CRM encaixava no balcão dentro da folga
-- que o próprio sistema recusa pelo WhatsApp. Agora é trigger na tabela — a
-- única peça que os quatro caminhos atravessam.
--
-- As asserções cobrem o que o trigger recusa E o que ele deixa passar de
-- propósito: encostar exatamente na folga, o passado (contabilidade), o
-- vizinho cancelado, outro barbeiro, salão com folga zero e o update que não
-- mexe na agenda.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

\set salao    'eeee9000-0000-0000-0000-000000000001'
\set salao0   'eeee9000-0000-0000-0000-000000000002'
\set prof_p   'eeee9100-0000-0000-0000-000000000001'
\set prof_q   'eeee9100-0000-0000-0000-000000000002'
\set prof_p0  'eeee9100-0000-0000-0000-000000000003'
\set servico  'eeee9200-0000-0000-0000-000000000001'
\set servico0 'eeee9200-0000-0000-0000-000000000002'
\set c1 'eeee9300-0000-0000-0000-000000000001'
\set c2 'eeee9300-0000-0000-0000-000000000002'
\set c3 'eeee9300-0000-0000-0000-000000000003'
\set c4 'eeee9300-0000-0000-0000-000000000004'
\set c5 'eeee9300-0000-0000-0000-000000000005'
\set c6 'eeee9300-0000-0000-0000-000000000006'
\set A  'eeee9400-0000-0000-0000-000000000001'
\set B  'eeee9400-0000-0000-0000-000000000002'

insert into salons (id, nome, folga_entre_atendimentos_minutos) values
  (:'salao', 'Com folga de 10', 10),
  (:'salao0', 'Sem folga', 0);

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof_p', :'salao', 'P', true),
  (:'prof_q', :'salao', 'Q', true),
  (:'prof_p0', :'salao0', 'P0', true);

-- 40 minutos: `calcula_fim` (0035) deriva o fim da duração do serviço.
insert into services (id, salon_id, nome, duracao_minutos, preco) values
  (:'servico', :'salao', 'Corte', 40, 50),
  (:'servico0', :'salao0', 'Corte', 40, 50);

insert into clients (id, salon_id, nome) values
  (:'c1', :'salao', 'C1'), (:'c2', :'salao', 'C2'), (:'c3', :'salao', 'C3'),
  (:'c4', :'salao0', 'C4'), (:'c5', :'salao0', 'C5'), (:'c6', :'salao', 'C6');

-- Amanhã, para o trigger tratar como agenda e não como registro do passado.
create or replace function pg_temp.amanha(h text) returns timestamptz
language sql as $$ select ((current_date + 1)::text || ' ' || h)::timestamp at time zone 'America/Sao_Paulo' $$;
create or replace function pg_temp.ontem(h text) returns timestamptz
language sql as $$ select ((current_date - 1)::text || ' ' || h)::timestamp at time zone 'America/Sao_Paulo' $$;

-- A: 14:00–14:40 com P.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'A', :'salao', :'c1', :'prof_p', :'servico', pg_temp.amanha('14:00'), 'agendado', 'crm');

select throws_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.amanha('14:45'), 'agendado', 'crm')$$, :'salao', :'c2', :'prof_p', :'servico'),
  '23P01', null,
  '14:45 depois de um 14:00-14:40 com folga 10: recusado (sobram 5)'
);

select throws_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.amanha('13:15'), 'agendado', 'crm')$$, :'salao', :'c2', :'prof_p', :'servico'),
  '23P01', null,
  '13:15-13:55 antes de um 14:00: recusado -- a folga vale para os dois lados'
);

select lives_ok(
  format($$insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, %L, pg_temp.amanha('14:50'), 'agendado', 'crm')$$, :'B', :'salao', :'c2', :'prof_p', :'servico'),
  '14:50 encosta exatamente na folga: permitido -- e o que horarios_livres oferece'
);

select throws_ok(
  format($$update appointments set data_hora_inicio = pg_temp.amanha('14:45'), data_hora_fim = pg_temp.amanha('15:25') where id = %L$$, :'B'),
  '23P01', null,
  'remarcar para dentro da folga tambem e recusado'
);

select lives_ok(
  format($$update appointments set status = 'confirmado' where id = %L$$, :'B'),
  'update que nao mexe na agenda (confirmar) passa sem olhar a folga'
);

select lives_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.amanha('14:45'), 'agendado', 'crm')$$, :'salao', :'c3', :'prof_q', :'servico'),
  'outro barbeiro as 14:45: a folga e por cadeira, nao por salao'
);

-- Registrar o passado é contabilidade: o barbeiro atendeu colado e está
-- lançando depois.
insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'salao', :'c1', :'prof_p', :'servico', pg_temp.ontem('14:00'), 'concluido', 'crm');
select lives_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.ontem('14:45'), 'concluido', 'crm')$$, :'salao', :'c3', :'prof_p', :'servico'),
  'lancamento retroativo dentro da folga passa: e registro, nao agenda'
);

-- Salão sem folga: só a sobreposição importa, e ela é da constraint.
insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
values (:'salao0', :'c4', :'prof_p0', :'servico0', pg_temp.amanha('14:00'), 'agendado', 'crm');
select lives_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.amanha('14:41'), 'agendado', 'crm')$$, :'salao0', :'c5', :'prof_p0', :'servico0'),
  'salao com folga zero aceita 14:41 depois de um 14:00-14:40'
);

-- Vizinho cancelado não ocupa cadeira.
update appointments set status = 'cancelado' where id = :'A';
select lives_ok(
  format($$insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem)
           values (%L, %L, %L, %L, pg_temp.amanha('13:15'), 'agendado', 'crm')$$, :'salao', :'c6', :'prof_p', :'servico'),
  'com o vizinho cancelado, 13:15 passa'
);

select * from finish();
rollback;
