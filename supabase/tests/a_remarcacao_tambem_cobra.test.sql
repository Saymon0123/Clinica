-- A cobrança por evento (migration 0217).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 4 é o coração.** Duas remarcações têm de virar DOIS eventos. A
-- tabela guarda só `remarcado_pelo_cliente_em`, um carimbo sobrescrito a cada
-- vez: foi exatamente por não conseguir contar a segunda que a cobrança deixou
-- de sair de lá. Se alguém voltar a derivar a cobrança daquela coluna, esta
-- asserção cai.
--
-- **A 2, a 3 e a 5 guardam o lado de fora.** Link público e balcão NÃO são
-- cobrados — foi a regra que o dono definiu, e é a frase que o material de
-- venda repete. Cobrar o que a página promete de graça é o tipo de erro que o
-- cliente descobre na primeira fatura.
--
-- **A 8 é a que ninguém olharia.** `valor_gerado` é "quanto a barbearia
-- faturou", e o dono compara com o que paga. Remarcação não traz dinheiro novo:
-- somar o preço do serviço de novo a cada remarcação inflaria o número e
-- faria o produto parecer melhor do que é.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set salao 'eeee0217-0000-0000-0000-000000000001'
\set prof  'eeee0217-0001-0000-0000-000000000001'
\set serv  'eeee0217-0002-0000-0000-000000000001'
\set cli   'eeee0217-0003-0000-0000-000000000001'
\set ag    'eeee0217-0004-0000-0000-000000000001'
\set pub   'eeee0217-0004-0000-0000-000000000002'
\set crm   'eeee0217-0004-0000-0000-000000000003'
\set blo   'eeee0217-0004-0000-0000-000000000004'

insert into salons (id, nome, ativo, cobravel)
values (:'salao', 'Barbearia da Remarcacao', true, true);
insert into professionals (id, salon_id, nome, ativo) values (:'prof', :'salao', 'Barbeiro', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'serv', :'salao', 'Corte', 40, 50, true);
insert into clients (id, salon_id, nome, telefone) values (:'cli', :'salao', 'Cliente', '5541977770501');

insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem) values
  (:'ag',  :'salao', :'cli', :'prof', :'serv', now() + interval '2 days', 'agendado', 'agente'),
  (:'pub', :'salao', :'cli', :'prof', :'serv', now() + interval '3 days', 'agendado', 'publico'),
  (:'crm', :'salao', :'cli', :'prof', :'serv', now() + interval '4 days', 'agendado', 'crm'),
  (:'blo', :'salao', null,   :'prof', :'serv', now() + interval '5 days', 'bloqueio', 'agente');

-- 1 a 3: quem entra e quem nao entra, no nascimento.
select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'ag'),
  1,
  'horario marcado pelo agente gera UM evento de cobranca'
);

select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'pub'),
  0,
  'link publico NAO e cobrado -- e a regra que o material de venda promete'
);

select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'crm'),
  0,
  'balcao NAO e cobrado: o sistema nao fez o agendamento, o barbeiro fez'
);

-- 4: o CORACAO. Duas remarcacoes, dois eventos.
update appointments set remarcado_pelo_cliente_em = now() where id = :'ag';
update appointments set remarcado_pelo_cliente_em = now() + interval '1 second' where id = :'ag';

select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'ag' and tipo = 'remarcacao'),
  2,
  'DUAS remarcacoes viram DOIS eventos -- o carimbo sozinho so sabia contar uma'
);

-- 5: remarcar o do link publico continua sem custo.
update appointments set remarcado_pelo_cliente_em = now() where id = :'pub';

select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'pub'),
  0,
  'remarcar horario do link publico nao cobra: ele nunca foi do WhatsApp'
);

-- 6: bloqueio de agenda nao e atendimento.
select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'blo'),
  0,
  'bloqueio de agenda nao gera cobranca, mesmo com origem agente'
);

-- 6b: reativacao que JA CHEGA confirmada tambem cobra.
--
-- Este caso nasceu de um defeito meu: o gatilho so tratava a confirmacao no
-- UPDATE, e uma reativacao inserida pronta passava de graca. Quem pegou foi o
-- pgTAP antigo (`um_numero_so`), cuja fixture insere exatamente assim -- a
-- regra da view sempre contou essa linha.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem, reativacao_confirmada_em)
values ('eeee0217-0004-0000-0000-000000000005', :'salao', :'cli', :'prof', :'serv',
        now() + interval '6 days', 'agendado', 'reativacao', now());

select is(
  (select count(*)::int from eventos_cobraveis
    where appointment_id = 'eeee0217-0004-0000-0000-000000000005'),
  1,
  'reativacao inserida JA confirmada cobra -- o gatilho nao pode depender do UPDATE'
);

-- 7: o agendamento e cobrado UMA vez, por mais que a linha seja mexida.
update appointments set status = 'confirmado' where id = :'ag';
update appointments set chegou_em = now() where id = :'ag';

select is(
  (select count(*)::int from eventos_cobraveis where appointment_id = :'ag' and tipo = 'agendamento'),
  1,
  'mexer no horario nao cobra de novo -- o indice unico segura o agendamento'
);

-- 8 e 9: a fatura. Um `create table as` materializa a chamada: lendo
-- `(funcao()).*` direto, o Postgres chama a funcao UMA VEZ POR COLUNA e o
-- resultado sai quase todo nulo -- aconteceu ao escrever este teste.
create temp table _fatura as
  select public.gerar_fatura_de_uso(
    :'salao',
    (now() at time zone 'America/Sao_Paulo')::date - 1,
    (now() at time zone 'America/Sao_Paulo')::date
  ) as r;

select is(
  (select (r).valor from _fatura),
  2.25::numeric,
  'a fatura cobra os TRES eventos a R$ 0,75: um agendamento e duas remarcacoes'
);

select is(
  (select (r).valor_gerado from _fatura),
  50.00::numeric,
  'o que a barbearia FATUROU conta o servico uma vez -- remarcacao nao traz dinheiro novo'
);

-- 10: o trinco.
select ok(
  not has_table_privilege('anon', 'public.eventos_cobraveis', 'select')
  and not has_table_privilege('authenticated', 'public.eventos_cobraveis', 'select'),
  'ninguem le a tabela de cobranca pelo REST -- so o service_role e as funcoes definer'
);

select * from finish();
rollback;
