-- A cadeira certa e a hora certa (migration 0158 — achados A8, M4, M5 e M16).
--
-- Os quatro defeitos só aparecem no celular do cliente: uma reserva com um
-- barbeiro que saiu, num dia em que a barbearia não abre; a pergunta "como foi
-- seu atendimento?" às 23h40; a mesma pergunta para quem só comprou pomada. O
-- dono nunca vê nenhum deles — e por isso nenhum deles seria pego por um teste
-- de tela.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(29);

-- Dois cuidados para o relógio não decidir o resultado, que é como a
-- `cadeia_de_cobranca` quebrou às 02:31 UTC num commit de documentação:
--
--   1. o alvo da reativação é sempre 24h30 a partir de agora, que é a janela em
--      que o cron aceita o horário; as barbearias do teste abrem 24 horas e os
--      barbeiros atendem os sete dias, então a hora do CI não muda nada;
--   2. a janela de silêncio é testada primeiro como função pura e depois
--      TROCADA dentro desta transação, para as filas serem medidas com a janela
--      aberta e com ela fechada — em vez de "passa de dia e mente de
--      madrugada". A troca some no rollback.
create or replace function pg_temp.alvo() returns timestamptz
language sql stable as $$ select now() + interval '24 hours 30 minutes' $$;

\set salao_ok        'bbbb9000-0000-0000-0000-000000000001'
\set salao_saiu      'bbbb9000-0000-0000-0000-000000000002'
\set salao_bloqueado 'bbbb9000-0000-0000-0000-000000000003'
\set salao_fechado   'bbbb9000-0000-0000-0000-000000000004'
\set salao_servico   'bbbb9000-0000-0000-0000-000000000005'

\set barbeiro_ok     'bbbb9001-0000-0000-0000-000000000001'
\set barbeiro_saiu   'bbbb9001-0000-0000-0000-000000000002'
\set barbeiro_novo   'bbbb9001-0000-0000-0000-000000000012'
\set barbeiro_bloq   'bbbb9001-0000-0000-0000-000000000003'
\set barbeiro_fech   'bbbb9001-0000-0000-0000-000000000004'
\set barbeiro_serv   'bbbb9001-0000-0000-0000-000000000005'

\set cliente_ok      'bbbb9002-0000-0000-0000-000000000001'
\set cliente_ok2     'bbbb9002-0000-0000-0000-000000000011'
\set cliente_saiu    'bbbb9002-0000-0000-0000-000000000002'
\set cliente_bloq    'bbbb9002-0000-0000-0000-000000000003'
\set cliente_fech    'bbbb9002-0000-0000-0000-000000000004'
\set cliente_serv    'bbbb9002-0000-0000-0000-000000000005'

\set servico_ok      'bbbb9003-0000-0000-0000-000000000001'
\set servico_saiu    'bbbb9003-0000-0000-0000-000000000002'
\set servico_bloq    'bbbb9003-0000-0000-0000-000000000003'
\set servico_fech    'bbbb9003-0000-0000-0000-000000000004'
\set servico_off     'bbbb9003-0000-0000-0000-000000000005'

\set comanda_servico 'bbbb9004-0000-0000-0000-000000000001'
\set comanda_produto 'bbbb9004-0000-0000-0000-000000000002'
\set comanda_furada  'bbbb9004-0000-0000-0000-000000000003'
\set ag_cancelado    'bbbb9005-0000-0000-0000-000000000003'

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into salons (id, nome, horario_funcionamento) values
  (:'salao_ok',        'Aberta Sempre',  '{"dom":{"abre":"00:00","fecha":"23:59"},"seg":{"abre":"00:00","fecha":"23:59"},"ter":{"abre":"00:00","fecha":"23:59"},"qua":{"abre":"00:00","fecha":"23:59"},"qui":{"abre":"00:00","fecha":"23:59"},"sex":{"abre":"00:00","fecha":"23:59"},"sab":{"abre":"00:00","fecha":"23:59"}}'::jsonb),
  (:'salao_saiu',      'Barbeiro Foi',   '{"dom":{"abre":"00:00","fecha":"23:59"},"seg":{"abre":"00:00","fecha":"23:59"},"ter":{"abre":"00:00","fecha":"23:59"},"qua":{"abre":"00:00","fecha":"23:59"},"qui":{"abre":"00:00","fecha":"23:59"},"sex":{"abre":"00:00","fecha":"23:59"},"sab":{"abre":"00:00","fecha":"23:59"}}'::jsonb),
  (:'salao_bloqueado', 'Acesso Vencido', '{"dom":{"abre":"00:00","fecha":"23:59"},"seg":{"abre":"00:00","fecha":"23:59"},"ter":{"abre":"00:00","fecha":"23:59"},"qua":{"abre":"00:00","fecha":"23:59"},"qui":{"abre":"00:00","fecha":"23:59"},"sex":{"abre":"00:00","fecha":"23:59"},"sab":{"abre":"00:00","fecha":"23:59"}}'::jsonb),
  (:'salao_fechado',   'Nunca Abre',     '{}'::jsonb),
  (:'salao_servico',   'Servico Fora',   '{"dom":{"abre":"00:00","fecha":"23:59"},"seg":{"abre":"00:00","fecha":"23:59"},"ter":{"abre":"00:00","fecha":"23:59"},"qua":{"abre":"00:00","fecha":"23:59"},"qui":{"abre":"00:00","fecha":"23:59"},"sex":{"abre":"00:00","fecha":"23:59"},"sab":{"abre":"00:00","fecha":"23:59"}}'::jsonb);

-- Acesso em dia em todas, menos na que existe para provar o bloqueio.
insert into subscriptions (salon_id, status, acesso_ate) values
  (:'salao_ok',        'ativa', current_date + 90),
  (:'salao_saiu',      'ativa', current_date + 90),
  (:'salao_bloqueado', 'ativa', current_date - 10),
  (:'salao_fechado',   'ativa', current_date + 90),
  (:'salao_servico',   'ativa', current_date + 90);

insert into professionals (id, salon_id, nome, ativo) values
  (:'barbeiro_ok',   :'salao_ok',        'Joao',   true),
  (:'barbeiro_saiu', :'salao_saiu',      'Pedro',  false),
  (:'barbeiro_novo', :'salao_saiu',      'Marcos', true),
  (:'barbeiro_bloq', :'salao_bloqueado', 'Carlos', true),
  (:'barbeiro_fech', :'salao_fechado',   'Tiago',  true),
  (:'barbeiro_serv', :'salao_servico',   'Rui',    true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select p.id, d, time '00:00', time '23:59', true
  from professionals p, generate_series(0, 6) d
 where p.id in (:'barbeiro_ok', :'barbeiro_saiu', :'barbeiro_novo',
                :'barbeiro_bloq', :'barbeiro_fech', :'barbeiro_serv');

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'servico_ok',   :'salao_ok',        'Corte', 30, 50, true),
  (:'servico_saiu', :'salao_saiu',      'Corte', 30, 50, true),
  (:'servico_bloq', :'salao_bloqueado', 'Corte', 30, 50, true),
  (:'servico_fech', :'salao_fechado',   'Corte', 30, 50, true),
  (:'servico_off',  :'salao_servico',   'Corte', 30, 50, false);

insert into clients (id, salon_id, nome, telefone, reativacao_semanas) values
  (:'cliente_ok',   :'salao_ok',        'Cliente Um',    '41999990001', 1),
  -- Sem reativação de propósito: existe só para as comandas do M5, e não pode
  -- ganhar reserva nenhuma quando o cron rodar.
  (:'cliente_ok2',  :'salao_ok',        'Cliente Seis',  '41999990006', null),
  (:'cliente_saiu', :'salao_saiu',      'Cliente Dois',  '41999990002', 1),
  (:'cliente_bloq', :'salao_bloqueado', 'Cliente Tres',  '41999990003', 1),
  (:'cliente_fech', :'salao_fechado',   'Cliente Quatro','41999990004', 1),
  (:'cliente_serv', :'salao_servico',   'Cliente Cinco', '41999990005', 1);

-- A última visita, posta de propósito uma semana antes do alvo: o próximo
-- múltiplo de 1 semana cai exatamente na janela de 24 a 25 horas.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status)
select v.s, v.c, v.p, v.sv,
       pg_temp.alvo() - interval '7 days',
       pg_temp.alvo() - interval '7 days' + interval '30 minutes', 'concluido'
  from (values
    (:'salao_ok'::uuid,        :'cliente_ok'::uuid,   :'barbeiro_ok'::uuid,   :'servico_ok'::uuid),
    (:'salao_saiu',            :'cliente_saiu',       :'barbeiro_saiu',       :'servico_saiu'),
    (:'salao_bloqueado',       :'cliente_bloq',       :'barbeiro_bloq',       :'servico_bloq'),
    (:'salao_fechado',         :'cliente_fech',       :'barbeiro_fech',       :'servico_fech'),
    (:'salao_servico',         :'cliente_serv',       :'barbeiro_serv',       :'servico_off')
  ) as v(s, c, p, sv);

-- A fila da avaliação trava por template aprovado e remetente ativo; no banco
-- novo do CI nenhum dos dois está pronto, e sem isto as asserções passariam
-- verdes sobre uma view vazia — provando nada.
insert into remetentes_oficiais (phone_number_id, rotulo, ativo)
values ('teste-0158', 'Teste', true)
on conflict (phone_number_id) do nothing;

insert into whatsapp_templates (chave, nome_meta, idioma, categoria, corpo, status, ativo)
values ('avaliacao_pos_atendimento', 'avaliacao_pos_atendimento', 'pt_BR', 'utility',
        'Oi, {{1}}! Como foi seu atendimento na *{{2}}*?', 'aprovado', true)
on conflict (chave) do update set status = 'aprovado', ativo = true;

insert into orders (id, salon_id, client_id, professional_id, status, closed_at) values
  (:'comanda_servico', :'salao_ok', :'cliente_ok',  :'barbeiro_ok', 'fechada', now() - interval '3 hours'),
  (:'comanda_produto', :'salao_ok', :'cliente_ok2', :'barbeiro_ok', 'fechada', now() - interval '3 hours');

insert into order_items (order_id, tipo, service_id, quantidade, preco_unitario) values
  (:'comanda_servico', 'servico', :'servico_ok', 1, 50);
insert into order_items (order_id, tipo, quantidade, preco_unitario) values
  (:'comanda_produto', 'produto', 1, 25);

-- O caminho que ninguém lembra: comanda fechada em cima de um agendamento que
-- foi cancelado. Dinheiro entrou, atendimento não houve.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status)
values (:'ag_cancelado', :'salao_ok', :'cliente_ok', :'barbeiro_ok', :'servico_ok',
        now() - interval '4 hours', now() - interval '3 hours 30 minutes', 'cancelado');

insert into orders (id, salon_id, client_id, professional_id, appointment_id, status, closed_at)
values (:'comanda_furada', :'salao_ok', :'cliente_ok2', :'barbeiro_ok', :'ag_cancelado',
        'fechada', now() - interval '3 hours');
insert into order_items (order_id, tipo, service_id, quantidade, preco_unitario)
values (:'comanda_furada', 'servico', :'servico_ok', 1, 50);

-- ---------------------------------------------------------------------------
-- M4 — a janela de silêncio, medida no relógio e não no acaso do CI
-- ---------------------------------------------------------------------------
-- O Brasil não tem horário de verão desde 2019, então -03 é sempre Brasília.

select is(private.hora_de_falar(timestamptz '2026-09-11 23:40-03'), false,
  'comanda fechada as 21h40 nao vira pergunta as 23h40');

select is(private.hora_de_falar(timestamptz '2026-09-11 10:00-03'), true,
  'dez da manha e hora de falar');

select is(private.hora_de_falar(timestamptz '2026-09-11 08:59-03'), false,
  'um minuto antes das nove ainda e silencio');

select is(private.hora_de_falar(timestamptz '2026-09-11 19:59-03'), true,
  'um minuto antes das oito da noite ainda da');

select is(private.hora_de_falar(timestamptz '2026-09-11 20:00-03'), false,
  'as oito em ponto a janela fecha');

-- A partir daqui a janela está aberta, para as filas serem medidas pelo que
-- elas de fato filtram. Volta a fechar mais adiante, de propósito.
create or replace function private.hora_de_falar(p_quando timestamptz default now())
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$ select true $$;

-- ---------------------------------------------------------------------------
-- M5 — avaliação só de quem foi atendido
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda_produto'),
  0,
  'quem so comprou pomada nao recebe "como foi seu atendimento?"'
);

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda_servico'),
  1,
  'comanda com servico de verdade continua entrando na fila'
);

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda_furada'),
  0,
  'agendamento cancelado nao vira pergunta sobre o atendimento'
);

-- ---------------------------------------------------------------------------
-- A8 — a reativação passa a usar a régua da casa
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select criar_agendamentos_de_reativacao()$$,
  'o cron da reativacao roda sem erro'
);

select is(
  (select professional_id from appointments
    where client_id = :'cliente_ok' and origem = 'reativacao'),
  :'barbeiro_ok'::uuid,
  'barbearia aberta e barbeiro na equipe: a cadeira e reservada com ele mesmo'
);

select ok(
  (select abs(extract(epoch from (a.data_hora_inicio - pg_temp.alvo()))) <= 3600
     from appointments a
    where a.client_id = :'cliente_ok' and a.origem = 'reativacao'),
  'o horario reservado fica a no maximo uma hora do horario de sempre'
);

select is(
  (select (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
     from appointments a
    where a.client_id = :'cliente_ok' and a.origem = 'reativacao'),
  (pg_temp.alvo() at time zone 'America/Sao_Paulo')::date,
  'e no mesmo dia — nunca empurrado para o dia seguinte'
);

select is(
  (select professional_id from appointments
    where client_id = :'cliente_saiu' and origem = 'reativacao'),
  :'barbeiro_novo'::uuid,
  'barbeiro que saiu da equipe: a cadeira e reservada com outro, nao com o fantasma'
);

select is(
  (select count(*)::int from appointments
    where client_id = :'cliente_bloq' and origem = 'reativacao'),
  0,
  'barbearia com acesso bloqueado nao dispara template cobrado em nome dela'
);

select is(
  (select count(*)::int from appointments
    where client_id = :'cliente_fech' and origem = 'reativacao'),
  0,
  'barbearia fechada naquele dia nao ganha reserva nenhuma'
);

select is(
  (select count(*)::int from appointments
    where client_id = :'cliente_serv' and origem = 'reativacao'),
  0,
  'servico tirado do catalogo nao volta pela reativacao'
);

-- ---------------------------------------------------------------------------
-- A fila do convite
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from reativacoes_a_enviar where client_id = :'cliente_ok'),
  1,
  'a reserva recem-criada entra na fila do convite'
);

-- Janela fechada: as duas filas ficam vazias, e as MESMAS linhas que acabaram
-- de ser contadas acima é que somem. Sem este par, "fila vazia" não prova nada.
create or replace function private.hora_de_falar(p_quando timestamptz default now())
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$ select false $$;

select is(
  (select count(*)::int from avaliacoes_a_pedir where order_id = :'comanda_servico'),
  0,
  'fora da janela a avaliacao espera: a fila fica vazia'
);

select is(
  (select count(*)::int from reativacoes_a_enviar where client_id = :'cliente_ok'),
  0,
  'fora da janela o convite de reativacao tambem espera'
);

create or replace function private.hora_de_falar(p_quando timestamptz default now())
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$ select true $$;

-- Quem marcou sozinho de manhã não pode receber o convite à tarde: seriam duas
-- cadeiras ocupadas pela mesma pessoa, e horários disjuntos não violam
-- constraint nenhuma.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values (:'salao_ok', :'cliente_ok', :'barbeiro_ok', :'servico_ok',
        now() + interval '3 days', now() + interval '3 days' + interval '30 minutes',
        'agendado', 'crm');

select is(
  (select count(*)::int from reativacoes_a_enviar where client_id = :'cliente_ok'),
  0,
  'cliente que ja tem horario marcado nao recebe convite para marcar de novo'
);

delete from appointments
 where client_id = :'cliente_ok' and origem = 'crm' and status = 'agendado';

-- Barbeiro que sai da equipe DEPOIS da reserva: a linha sai da fila em vez de
-- virar "reservei seu horario com o Joao" sobre quem nao trabalha mais ali.
update professionals set ativo = false where id = :'barbeiro_ok';

select is(
  (select count(*)::int from reativacoes_a_enviar where client_id = :'cliente_ok'),
  0,
  'barbeiro que saiu depois da reserva nao tem o nome mandado ao cliente'
);

-- ---------------------------------------------------------------------------
-- A cadeira que ninguém soube que existia
-- ---------------------------------------------------------------------------

insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem, confirmacao_enviada)
values
  -- passou da hora de ser enviada: nunca mais vai ser
  (:'salao_bloqueado', :'cliente_bloq', :'barbeiro_bloq', :'servico_bloq',
   now() + interval '1 hour', now() + interval '1 hour 30 minutes', 'agendado', 'reativacao', false),
  -- ainda dentro da janela de envio: continua de pé
  (:'salao_fechado', :'cliente_fech', :'barbeiro_fech', :'servico_fech',
   now() + interval '10 hours', now() + interval '10 hours 30 minutes', 'agendado', 'reativacao', false);

select lives_ok(
  $$select expira_reativacoes_sem_resposta()$$,
  'a expiracao roda sem erro'
);

select is(
  (select status from appointments
    where client_id = :'cliente_bloq' and origem = 'reativacao'),
  'cancelado',
  'reserva que nunca chegou a ser enviada e solta em vez de segurar a agenda para sempre'
);

select is(
  (select status from appointments
    where client_id = :'cliente_fech' and origem = 'reativacao'),
  'agendado',
  'reserva ainda dentro da janela de envio continua de pe'
);

-- ---------------------------------------------------------------------------
-- M16 — a Política de Atraso não existe mais em lugar nenhum
-- ---------------------------------------------------------------------------

select hasnt_view('public', 'atrasos_para_perguntar',
  'a fila da politica de atraso nao existe mais');

select hasnt_column('public', 'appointments', 'atraso_perguntado_em',
  'e nem a coluna que so ela usava');

select hasnt_column('public', 'salons', 'atraso_tolerado_minutos',
  'nem o numero que o dono ajustava sem efeito');

select is(
  (select count(*)::int from whatsapp_templates where chave = 'atraso_esta_vindo'),
  0,
  'o template que nunca saiu de rascunho sai junto'
);

select hasnt_view('public', 'clientes_para_reativar',
  'a fila de reativacao do desenho antigo, sem consumidor nenhum, tambem sai');

select * from finish();
rollback;
