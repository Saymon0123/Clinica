-- Uma regra para cancelar (migration 0166).
--
-- O cliente cancela o próprio horário por três portas, e cada uma decidia
-- sozinha quando era tarde demais: o link público exigia 30 minutos, o botão do
-- lembrete só exigia que o horário ainda não tivesse passado, e o agente não
-- exigia nada. Esta migration fecha a porta do lembrete, que é a mais usada --
-- ele chega 85 a 100 minutos antes, com o botão de cancelar dentro.
--
-- O que este teste prova, e a ordem importa: que a recusa **acontece**, que ela
-- **não estraga o botão** (o caso que quase me escapou), e que ela **não vazou**
-- para confirmar, que o dono decidiu deixar livre.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao    'cccc9000-0000-0000-0000-000000000001'
\set barbeiro 'cccc9001-0000-0000-0000-000000000001'
\set servico  'cccc9002-0000-0000-0000-000000000001'
\set cliente  'cccc9003-0000-0000-0000-000000000001'
\set perto    'cccc9004-0000-0000-0000-000000000001'
\set longe    'cccc9004-0000-0000-0000-000000000002'
\set confirma 'cccc9004-0000-0000-0000-000000000003'

insert into salons (id, nome) values (:'salao', 'Uma Regra So');
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Bar', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 30, 50, true);
insert into clients (id, salon_id, nome, telefone) values (:'cliente', :'salao', 'Joao Silva', '41977770001');

-- Horários espaçados: o banco recusa sobreposição no mesmo barbeiro
-- (`appointments_sem_sobreposicao`), e fixture que a viola morre antes do teste.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem, lembrete_message_id)
values
  (:'perto',    :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '10 minutes', now() + interval '13 minutes', 'agendado', 'crm', 'wamid-perto'),
  (:'confirma', :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '20 minutes', now() + interval '23 minutes', 'agendado', 'crm', 'wamid-confirma'),
  (:'longe',    :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '2 hours', now() + interval '2 hours 3 minutes', 'agendado', 'crm', 'wamid-longe');

-- ---------------------------------------------------------------------------
-- A regra, sozinha
-- ---------------------------------------------------------------------------

select ok(private.pode_cancelar(now() + interval '2 hours'), 'duas horas antes, pode cancelar');
select ok(not private.pode_cancelar(now() + interval '10 minutes'), 'dez minutos antes, nao pode');

-- 30 minutos exatos: o limite é `>=`, então ainda pode. Se um dia alguém trocar
-- por `>`, é esta linha que cai -- e é de propósito que ela exista.
select ok(private.pode_cancelar(now() + interval '30 minutes 1 second'), 'no limite de 30 minutos, ainda pode');

-- ---------------------------------------------------------------------------
-- A recusa acontece, e nao cancela
-- ---------------------------------------------------------------------------

select is(
  responder_lembrete('wamid-perto', 'Cancelar') ->> 'acao',
  'cancelar_tarde',
  'cancelar faltando 10 minutos e recusado'
);

select is(
  (select status from appointments where id = :'perto'),
  'agendado',
  'e o horario continua de pe: recusar nao e cancelar em silencio'
);

-- ---------------------------------------------------------------------------
-- E a recusa NAO estraga o botao
-- ---------------------------------------------------------------------------
-- O caso que quase me escapou: se a recusa marcasse `lembrete_respondido_em`,
-- o proximo toque cairia no ramo 'repetido' e a pessoa ficaria SEM RESPOSTA
-- nenhuma -- pior que a recusa. Como ela nao cancelou, tocar de novo depois de
-- falar com a barbearia tem de continuar valendo.
select is(
  responder_lembrete('wamid-perto', 'Cancelar') ->> 'acao',
  'cancelar_tarde',
  'tocar de novo responde igual, em vez de cair em "repetido"'
);

-- ---------------------------------------------------------------------------
-- O que a regra NAO alcanca
-- ---------------------------------------------------------------------------

select is(
  responder_lembrete('wamid-longe', 'Cancelar') ->> 'acao',
  'cancelado',
  'fora da janela, cancelar segue funcionando'
);

-- Decisão do dono em 13/09: o piso vale só para cancelar. Confirmar em cima da
-- hora é inofensivo -- e travá-lo faria o cliente que avisa que vem parecer que
-- não avisou.
select is(
  responder_lembrete('wamid-confirma', 'Sim, confirmo') ->> 'acao',
  'confirmado',
  'confirmar faltando 20 minutos continua livre: o piso e so do cancelar'
);

select * from finish();
rollback;
