-- A pausa da reativação diz por quê, e o "não quero mais" do cliente fica
-- (migration 0154 — achado 1 do plano C, 11/09).
--
-- O cliente que toca "Cancelar" no convite ouve que o sistema não vai mais
-- reservar horário para ele. Antes, só a pausa era gravada e as semanas
-- ficavam — a próxima venda religava tudo. As asserções cobrem os três
-- motivos de pausa (o botão, as faltas, a falta de resposta), a correção que
-- desfaz a pausa das faltas, e a pausa pedida pelo cliente, que nenhuma falta
-- sobrescreve.
--
-- `now()` é um instante só dentro da transação do teste: é ele que as
-- asserções de carimbo comparam.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(15);

\set salao    'cccc9000-0000-0000-0000-000000000001'
\set prof     'cccc9100-0000-0000-0000-000000000001'
\set prof2    'cccc9100-0000-0000-0000-000000000002'
\set servico  'cccc9200-0000-0000-0000-000000000001'
\set c_para   'cccc9300-0000-0000-0000-000000000001'
\set c_falta  'cccc9300-0000-0000-0000-000000000002'
\set c_mudo   'cccc9300-0000-0000-0000-000000000003'
\set c_parou  'cccc9300-0000-0000-0000-000000000004'
\set a_para   'cccc9400-0000-0000-0000-000000000001'
\set a_falta  'cccc9400-0000-0000-0000-000000000002'
\set a_mudo   'cccc9400-0000-0000-0000-000000000003'
\set a_parou  'cccc9400-0000-0000-0000-000000000004'

insert into salons (id, nome) values (:'salao', 'Pausa da reativacao');

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof', :'salao', 'P', true),
  (:'prof2', :'salao', 'Q', true);

insert into services (id, salon_id, nome, duracao_minutos, preco) values
  (:'servico', :'salao', 'Corte', 30, 50);

-- c_para vai tocar "Cancelar"; c_falta já faltou uma vez; c_mudo já recebeu 2
-- convites sem responder; c_parou pediu para parar ontem.
insert into clients (id, salon_id, nome, reativacao_semanas, reativacao_no_shows, reativacao_sem_resposta, reativacao_pausada_em, reativacao_pausa_motivo) values
  (:'c_para',  :'salao', 'Para',  4,    0, 1, null,                     null),
  (:'c_falta', :'salao', 'Falta', 4,    1, 0, null,                     null),
  (:'c_mudo',  :'salao', 'Mudo',  4,    0, 2, null,                     null),
  (:'c_parou', :'salao', 'Parou', null, 1, 0, now() - interval '1 day', 'pediu_para_parar');

-- Convites enviados: a_para é amanhã; a_mudo é daqui a 2h, sem resposta.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem, confirmacao_enviada, lembrete_message_id) values
  (:'a_para', :'salao', :'c_para', :'prof', :'servico', now() + interval '1 day',   'agendado', 'reativacao', true, 'wamid.teste-pausa-para'),
  (:'a_mudo', :'salao', :'c_mudo', :'prof', :'servico', now() + interval '2 hours', 'agendado', 'reativacao', true, 'wamid.teste-pausa-mudo');

-- Reativação confirmada, horário que já passou sem venda.
insert into appointments (id, salon_id, client_id, professional_id, service_id, data_hora_inicio, status, origem, created_at) values
  (:'a_falta', :'salao', :'c_falta', :'prof',  :'servico', now() - interval '5 hours', 'confirmado', 'reativacao', now() - interval '1 day'),
  (:'a_parou', :'salao', :'c_parou', :'prof2', :'servico', now() - interval '5 hours', 'confirmado', 'reativacao', now() - interval '1 day');

-- 1. O cliente toca "Cancelar" no convite.
create temp table resposta as
  select responder_lembrete('wamid.teste-pausa-para', 'Cancelar') as j;

select is((select j ->> 'acao' from resposta), 'cancelado',
  'Cancelar no convite: o horario e cancelado');
select ok((select j ->> 'resposta' from resposta) like '%reservar hor%',
  'e ele ouve que o sistema nao vai mais reservar horario para ele');
select is((select reativacao_semanas from clients where id = :'c_para'), null::smallint,
  'o "a cada quantas semanas" e apagado: a proxima venda nao religa sozinha');
select is((select reativacao_pausa_motivo from clients where id = :'c_para'), 'pediu_para_parar',
  'a pausa diz o motivo');
select is((select reativacao_pausada_em from clients where id = :'c_para'), now(),
  'e quando');

-- 2. As faltas.
select ok(cancela_agendamentos_sem_comanda() >= 2, 'o cron varre as duas faltas');
select is((select reativacao_pausa_motivo from clients where id = :'c_falta'), 'faltas',
  'segunda falta: pausa com motivo faltas');
select is((select reativacao_pausa_motivo from clients where id = :'c_parou'), 'pediu_para_parar',
  'a falta nao troca o motivo de quem ja tinha pedido para parar');
select is((select reativacao_pausada_em from clients where id = :'c_parou'), now() - interval '1 day',
  'nem o carimbo da pausa dele');

-- 3. A correção: ele veio, o barbeiro lançou a venda depois dos 15 minutos.
update appointments set status = 'concluido' where id = :'a_falta';
select is((select reativacao_pausa_motivo from clients where id = :'c_falta'), null::text,
  'venda lancada tarde apaga o motivo');
select is((select reativacao_pausada_em from clients where id = :'c_falta'), null::timestamptz,
  'junto com a pausa que a falta causou');

-- 4. Dois convites sem resposta.
select ok(expira_reativacoes_sem_resposta() >= 1, 'a expiracao pega o convite sem resposta');
select is((select status from appointments where id = :'a_mudo'), 'cancelado',
  'o horario reservado sem resposta e cancelado');
select is((select reativacao_pausa_motivo from clients where id = :'c_mudo'), 'sem_resposta',
  'e a pausa diz que foi falta de resposta');

-- 5. O motivo só aceita os três nomes que a tela sabe explicar.
select throws_ok(
  format($$update clients set reativacao_pausa_motivo = 'qualquer' where id = %L$$, :'c_mudo'),
  '23514', null,
  'motivo fora da lista e recusado'
);

select * from finish();
rollback;
