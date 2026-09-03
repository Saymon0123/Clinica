-- Um número só para "agendamento do agente" (migration 0136, passo 4.1).
--
-- Três lugares contavam a mesma coisa de três jeitos: painel da Conexão, view
-- do mês e fatura. Agora os três leem de `agendamentos_cobraveis`, e este
-- teste prova que a view do mês e a fatura batem entre si e com a regra —
-- o painel (TypeScript) lê a mesma view.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao    'ffff9000-0000-0000-0000-00000000000a'
\set barbeiro 'ffff9222-0000-0000-0000-00000000000a'
\set corte    'ffff9333-0000-0000-0000-00000000000a'
\set barba    'ffff9333-0000-0000-0000-00000000000b'
\set a_agente 'ffff9444-0000-0000-0000-000000000001'
\set a_cancel 'ffff9444-0000-0000-0000-000000000002'
\set a_reat   'ffff9444-0000-0000-0000-000000000003'
\set a_reat_n 'ffff9444-0000-0000-0000-000000000004'
\set a_crm    'ffff9444-0000-0000-0000-000000000005'
\set a_bloq   'ffff9444-0000-0000-0000-000000000006'

insert into salons (id, nome) values (:'salao', 'Barbearia da Conta Unica');
insert into subscriptions (salon_id, status, acesso_ate) values (:'salao', 'ativa', date '2027-12-31');
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'João', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte', :'salao', 'Corte', 40, 50, true),
  (:'barba', :'salao', 'Barba', 30, 30, true);

-- Horários no PASSADO para o gatilho da folga (0134) não entrar no caminho;
-- o que importa aqui é `created_at`, que fica em now() (este mês).
insert into appointments (id, salon_id, professional_id, service_id, data_hora_inicio, data_hora_fim, status, origem, reativacao_confirmada_em) values
  (:'a_agente', :'salao', :'barbeiro', :'corte', now() - interval '3 hours', now() - interval '2 hours', 'agendado', 'agente', null),
  (:'a_cancel', :'salao', :'barbeiro', :'corte', now() - interval '5 hours', now() - interval '4 hours', 'cancelado', 'agente', null),
  (:'a_reat', :'salao', :'barbeiro', :'barba', now() - interval '7 hours', now() - interval '6 hours', 'agendado', 'reativacao', now()),
  (:'a_reat_n', :'salao', :'barbeiro', :'barba', now() - interval '9 hours', now() - interval '8 hours', 'agendado', 'reativacao', null),
  (:'a_crm', :'salao', :'barbeiro', :'corte', now() - interval '11 hours', now() - interval '10 hours', 'agendado', 'crm', null),
  (:'a_bloq', :'salao', :'barbeiro', null, now() - interval '13 hours', now() - interval '12 hours', 'bloqueio', 'agente', null);

-- O agendado pelo agente tem serviços combinados: a 0120 já espelha o
-- serviço principal em appointment_services no insert (por isso só a Barba
-- entra aqui — inserir o Corte de novo duplica a chave), Corte + Barba = 80.
-- O cancelado vale o principal (50) e a reativação confirmada, a Barba (30).
-- Total cobrável: 3 horários, R$ 160.
insert into appointment_services (appointment_id, service_id, ordem) values
  (:'a_agente', :'barba', 2);

select is(
  (select count(*)::int from agendamentos_cobraveis where salon_id = :'salao'),
  3,
  'cobravel = agente (agendado ou cancelado) + reativacao confirmada; nem crm, nem reativacao sem resposta, nem bloqueio'
);

select is(
  (select sum(valor_servico) from agendamentos_cobraveis where salon_id = :'salao'),
  160::numeric,
  'valor gerado soma os combinados quando existem e cai no servico principal quando nao'
);

select is(
  (select agendamentos::int from uso_do_sistema_no_mes where salon_id = :'salao'),
  3,
  'a view do mes le a mesma regra'
);

select is(
  (select valor_gerado from uso_do_sistema_no_mes where salon_id = :'salao'),
  160::numeric,
  'a view do mes soma o mesmo valor'
);

select is(
  (select agendamentos from gerar_fatura_de_uso(
     :'salao',
     date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date,
     (now() at time zone 'America/Sao_Paulo')::date,
     'mensal')),
  3,
  'a fatura conta o mesmo numero que a view do mes'
);

select is(
  (select valor_gerado from faturas_de_uso where salon_id = :'salao'),
  160::numeric,
  'a fatura grava o mesmo valor gerado'
);

select is(
  (select jsonb_array_length(detalhe) from faturas_de_uso where salon_id = :'salao'),
  3,
  'o detalhe da fatura lista exatamente os cobraveis'
);

select * from finish();
rollback;
