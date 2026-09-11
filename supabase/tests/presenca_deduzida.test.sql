-- Presença deduzida (migration 0153 — A7 do giro de 10/09, plano C de 11/09).
--
-- O cron `cancela_agendamentos_sem_comanda` passou a gravar `faltou`, e a
-- reativação, que só contava falta nessa transição, finalmente conta. As
-- asserções cobrem o que ele marca, o que ele deixa de propósito (futuro,
-- lançamento recente, concluído, reativação que o cliente nunca aceitou) e o
-- trigger dos dois lados: a falta que pausa, a correção que despausa, e a
-- pausa pedida pelo cliente, que nenhuma das duas pode tocar. Mais a trava que
-- o CRM trata quando a correção esbarra numa cadeira já ocupada.
--
-- Dentro do teste tudo roda numa transação só, então `now()` é um instante
-- fixo: é ele que as asserções de pausa comparam.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(14);

\set salao     'dddd9000-0000-0000-0000-000000000001'
\set p1        'dddd9100-0000-0000-0000-000000000001'
\set p2        'dddd9100-0000-0000-0000-000000000002'
\set servico   'dddd9200-0000-0000-0000-000000000001'
\set c_balcao  'dddd9300-0000-0000-0000-000000000001'
\set c_agente  'dddd9300-0000-0000-0000-000000000002'
\set c_mudo    'dddd9300-0000-0000-0000-000000000003'
\set c_reat    'dddd9300-0000-0000-0000-000000000004'
\set c_pediu   'dddd9300-0000-0000-0000-000000000005'
\set c_outro   'dddd9300-0000-0000-0000-000000000006'
\set a_balcao  'dddd9400-0000-0000-0000-000000000001'
\set a_agente  'dddd9400-0000-0000-0000-000000000002'
\set a_mudo    'dddd9400-0000-0000-0000-000000000003'
\set a_reat1   'dddd9400-0000-0000-0000-000000000004'
\set a_reat2   'dddd9400-0000-0000-0000-000000000005'
\set a_pediu   'dddd9400-0000-0000-0000-000000000006'
\set a_futuro  'dddd9400-0000-0000-0000-000000000007'
\set a_recente 'dddd9400-0000-0000-0000-000000000008'
\set a_feito   'dddd9400-0000-0000-0000-000000000009'

insert into salons (id, nome) values (:'salao', 'Presenca deduzida');

insert into professionals (id, salon_id, nome, ativo) values
  (:'p1', :'salao', 'P1', true),
  (:'p2', :'salao', 'P2', true);

-- 30 minutos: `calcula_fim` (0035) deriva o fim da duração do serviço.
insert into services (id, salon_id, nome, duracao_minutos, preco) values
  (:'servico', :'salao', 'Corte', 30, 50);

insert into clients (id, salon_id, nome) values
  (:'c_balcao', :'salao', 'Balcao'),
  (:'c_agente', :'salao', 'Agente'),
  (:'c_mudo', :'salao', 'Mudo'),
  (:'c_outro', :'salao', 'Outro');

-- Na base da reativação: um sem falta nenhuma, e outro que já faltou uma vez
-- e que ONTEM pediu para parar (a pausa dele tem outro instante).
insert into clients (id, salon_id, nome, reativacao_semanas, reativacao_no_shows, reativacao_pausada_em) values
  (:'c_reat', :'salao', 'Reat', 4, 0, null),
  (:'c_pediu', :'salao', 'Pediu', 4, 1, now() - interval '1 day');

-- Criados há 1 dia (fora da carência do lançamento retroativo) e terminados há
-- horas. Nenhum se sobrepõe a outro na mesma cadeira nem no mesmo cliente.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem, created_at) values
  (:'a_balcao', :'salao', :'c_balcao', :'p1', :'servico', now() - interval '5 hours',  'agendado',   'crm',        now() - interval '1 day'),
  (:'a_agente', :'salao', :'c_agente', :'p1', :'servico', now() - interval '4 hours',  'confirmado', 'agente',     now() - interval '1 day'),
  (:'a_mudo',   :'salao', :'c_mudo',   :'p1', :'servico', now() - interval '3 hours',  'agendado',   'reativacao', now() - interval '1 day'),
  (:'a_feito',  :'salao', :'c_agente', :'p1', :'servico', now() - interval '7 hours',  'concluido',  'agente',     now() - interval '1 day'),
  (:'a_futuro', :'salao', :'c_balcao', :'p1', :'servico', now() + interval '2 hours',  'agendado',   'crm',        now() - interval '1 day'),
  (:'a_reat1',  :'salao', :'c_reat',   :'p2', :'servico', now() - interval '10 hours', 'confirmado', 'reativacao', now() - interval '1 day'),
  (:'a_reat2',  :'salao', :'c_reat',   :'p2', :'servico', now() - interval '6 hours',  'confirmado', 'reativacao', now() - interval '1 day'),
  (:'a_pediu',  :'salao', :'c_pediu',  :'p2', :'servico', now() - interval '3 hours',  'confirmado', 'reativacao', now() - interval '1 day');

-- Lançado agora, para um horário que já terminou: é o barbeiro registrando
-- depois, e o cron não compete com ele.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem) values
  (:'a_recente', :'salao', :'c_outro', :'p2', :'servico', now() - interval '2 hours', 'agendado', 'crm');

select ok(
  cancela_agendamentos_sem_comanda() >= 6,
  'o cron varre os seis horarios vencidos sem venda'
);

select is((select status from appointments where id = :'a_balcao'), 'faltou',
  'balcao que passou sem venda: nao veio, nao cancelado');
select is((select status from appointments where id = :'a_agente'), 'faltou',
  'confirmado pelo agente e sem venda: nao veio');
select is((select status from appointments where id = :'a_mudo'), 'cancelado',
  'reativacao que o cliente nunca aceitou: cancelada -- sem o sim dele, nao e falta');
select is((select status from appointments where id = :'a_futuro'), 'agendado',
  'horario futuro: intocado');
select is((select status from appointments where id = :'a_recente'), 'agendado',
  'lancamento de agora ha pouco: carencia de 15 minutos');
select is((select status from appointments where id = :'a_feito'), 'concluido',
  'concluido: intocado');

-- `::smallint`: a coluna é smallint, e o `is()` do pgTAP exige os dois lados
-- do mesmo tipo — um `2` cru é integer e a função nem é encontrada.
select is((select reativacao_no_shows from clients where id = :'c_reat'), 2::smallint,
  'duas faltas em reativacao confirmada contam duas -- antes nao contavam nenhuma');
select is((select reativacao_pausada_em from clients where id = :'c_reat'), now(),
  'a segunda falta pausa o cliente');
select is((select reativacao_pausada_em from clients where id = :'c_pediu'), now() - interval '1 day',
  'a falta nao sobrescreve a pausa que o proprio cliente pediu');

-- A correção: ele veio, o barbeiro só lançou a venda depois dos 15 minutos.
update appointments set status = 'concluido' where id = :'a_reat2';
select is((select reativacao_pausada_em from clients where id = :'c_reat'), null::timestamptz,
  'faltou -> concluido desfaz a pausa que a falta causou');
select is((select reativacao_no_shows from clients where id = :'c_reat'), 0::smallint,
  'e zera as faltas, como todo atendimento concluido');

update appointments set status = 'concluido' where id = :'a_pediu';
select is((select reativacao_pausada_em from clients where id = :'c_pediu'), now() - interval '1 day',
  'a correcao nunca desfaz a pausa pedida pelo cliente');

-- A falta libera a cadeira, e alguém foi lançado nela. Corrigir a falta agora
-- faria dois atendimentos ocuparem o mesmo horário: as travas recusam, e o CRM
-- traduz isso em "desvincule o horário e finalize de novo".
insert into appointments (salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem) values
  (:'salao', :'c_outro', :'p1', :'servico', now() - interval '5 hours', 'concluido', 'crm');
select throws_ok(
  format($$update appointments set status = 'concluido' where id = %L$$, :'a_balcao'),
  '23P01', null,
  'corrigir uma falta cuja cadeira ja foi ocupada: recusado'
);

select * from finish();
rollback;
