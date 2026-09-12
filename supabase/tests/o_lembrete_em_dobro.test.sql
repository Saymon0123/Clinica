-- O lembrete em dobro (migration 0164 — a quarta fila do achado M12).
--
-- A 0163 fechou avaliação e reativação e deixou o lembrete de fora de propósito,
-- por ser o fluxo mais usado do produto. Aqui a exposição é MAIOR, não menor: a
-- busca do n8n usa uma janela de 15 minutos para um ciclo de 10, então metade
-- dos agendamentos é vista por duas rodadas **por construção**. A sobreposição é
-- deliberada (janela igual ao ciclo perderia horários por atraso de segundos no
-- agendador), e o que impedia o dobro era só `lembrete_enviado` — lido numa
-- rodada, escrito depois do envio, com a segunda rodada inteira cabendo no meio.
--
-- Concorrência de verdade não cabe numa transação de teste. O que cabe — e é o
-- que importa — é a propriedade em que ela se resolve: **chamar a reserva duas
-- vezes devolve a linha uma vez só**.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao    'eeee9000-0000-0000-0000-000000000001'
\set barbeiro 'eeee9001-0000-0000-0000-000000000001'
\set servico  'eeee9002-0000-0000-0000-000000000001'
\set cliente  'eeee9003-0000-0000-0000-000000000001'
\set na_janela  'eeee9004-0000-0000-0000-000000000001'
\set cedo_demais 'eeee9004-0000-0000-0000-000000000002'
\set reativacao  'eeee9004-0000-0000-0000-000000000003'
\set bloqueio    'eeee9004-0000-0000-0000-000000000004'

insert into salons (id, nome) values (:'salao', 'Lembrete Sem Dobro');
insert into professionals (id, salon_id, nome, ativo) values (:'barbeiro', :'salao', 'Joao', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 30, 50, true);
insert into clients (id, salon_id, nome, telefone) values (:'cliente', :'salao', 'Cliente', '41988880001');

-- Horários espaçados: o banco tem restrição de não-sobreposição por barbeiro
-- (`appointments_sem_sobreposicao`), e fixture que a viola morre antes do teste.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values
  (:'na_janela',   :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '86 minutes', now() + interval '89 minutes', 'agendado', 'crm'),
  (:'cedo_demais', :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '30 minutes', now() + interval '33 minutes', 'agendado', 'crm'),
  (:'reativacao',  :'salao', :'cliente', :'barbeiro', :'servico',
   now() + interval '92 minutes', now() + interval '95 minutes', 'agendado', 'reativacao'),
  (:'bloqueio',    :'salao', null,       :'barbeiro', :'servico',
   now() + interval '96 minutes', now() + interval '99 minutes', 'bloqueio', 'crm');

-- ---------------------------------------------------------------------------
-- O coração: duas execuções sobrepostas não recebem o mesmo agendamento
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'na_janela'),
  1,
  'a primeira execucao reserva e recebe o agendamento da janela'
);

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'na_janela'),
  0,
  'a segunda nao recebe o mesmo agendamento — e este e o lembrete em dobro que sumiu'
);

-- O prazo é o que faz uma execução que morreu devolver a linha, em vez de
-- silenciar o lembrete para sempre. Sem ele, um n8n que reinicia no momento
-- errado troca "mensagem repetida" por "cliente não avisado", que é pior.
update appointments set envio_reservado_ate = now() - interval '1 minute' where id = :'na_janela';

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'na_janela'),
  1,
  'vencida a reserva, o agendamento volta para a fila sozinho'
);

-- ---------------------------------------------------------------------------
-- Quem NÃO entra — os mesmos filtros que o fluxo já aplicava
-- ---------------------------------------------------------------------------
-- Medidos numa chamada só: a de cima já reservou o da janela, então o que
-- aparecer aqui entrou por engano.
update appointments set envio_reservado_ate = null where id = :'na_janela';

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'cedo_demais'),
  0,
  'agendamento fora da janela de 85-100 minutos nao entra'
);

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'reativacao'),
  0,
  'reativacao nao recebe lembrete: o convite dela ja foi, com os mesmos botoes'
);

select is(
  (select count(*)::int from reservar_lembretes(200) where id = :'bloqueio'),
  0,
  'bloqueio de agenda nao tem cliente para avisar'
);

-- ---------------------------------------------------------------------------
-- Reservar não é enviar
-- ---------------------------------------------------------------------------
select is(
  (select lembrete_enviado from appointments where id = :'na_janela'),
  false,
  'reservar nao marca lembrete_enviado: quem marca e o envio, e so depois que ele deu certo'
);

-- ---------------------------------------------------------------------------
-- Quem pode chamar
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.reservar_lembretes(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.reservar_lembretes(integer)', 'execute')
  and has_function_privilege('service_role', 'public.reservar_lembretes(integer)', 'execute'),
  'so o n8n (service_role) reserva: a funcao enxerga todas as barbearias de uma vez'
);

select * from finish();
rollback;
