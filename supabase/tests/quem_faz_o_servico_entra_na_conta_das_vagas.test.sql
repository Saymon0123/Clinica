-- Quem faz o serviço entra na conta das vagas (migration 0199).
--
-- ## O que este teste existe para impedir
--
-- Até a 0199 a tabela `professional_services` era **decorativa**: estava
-- populada e nada no sistema a lia. O `accept-invite` liga o barbeiro novo a
-- TODOS os serviços ativos, e a aba Equipe -- para onde o comentário dele
-- aponta -- não tem controle nenhum de serviço. Resultado medido na El Corte:
-- quatro barbeiros fazendo os oito serviços, inclusive "Luzes / platinado".
--
-- Com a régua de pé, o dia em que alguém desmarcar "platinado" para um barbeiro
-- o cliente para de ser oferecido a ele. **A asserção 2 é o coração**: ela exige
-- que o barbeiro desligado do serviço SAIA da lista de vagas.
--
-- E a asserção 4 guarda o lado oposto, que é mais fácil de errar: barbeiro sem
-- NENHUM serviço ligado conta como "faz todos". Filtrar ao pé da letra o faria
-- desaparecer da agenda inteira, e o dono veria menos horários sem explicação
-- -- o muro que a agenda pública nos ensinou a não construir.
--
-- Cada asserção monta a fixture de que precisa. No ensaio em produção, a
-- primeira versão da asserção 6 falhou porque herdou o estado da 5 (um barbeiro
-- tinha ficado sem lista e virou curinga): asserção que depende do que a
-- anterior deixou é asserção que decide no sorteio.
--
-- Fixture no relógio de São Paulo, nunca `current_date`.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao  'aaaa1990-0000-0000-0000-000000000001'
\set umA    'aaaa1991-0000-0000-0000-000000000001'
\set umB    'aaaa1991-0000-0000-0000-000000000002'
\set semLista 'aaaa1991-0000-0000-0000-000000000003'
\set corte  'aaaa1992-0000-0000-0000-000000000001'
\set quimica 'aaaa1992-0000-0000-0000-000000000002'

create or replace function pg_temp.dia() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia dos Servicos', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'umA',      :'salao', 'Faz Corte',        true),
  (:'umB',      :'salao', 'Faz Corte Tambem', true),
  (:'semLista', :'salao', 'Sem Lista',        true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values (:'umA',      extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true),
       (:'umB',      extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true),
       (:'semLista', extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',   :'salao', 'Corte',   30, 50,  true),
  (:'quimica', :'salao', 'Quimica', 60, 200, true);

-- Os dois primeiros fazem corte; só o umB faz quimica. O semLista fica sem
-- nenhum vinculo, de propósito: é o caso da asserção 4.
insert into professional_services (professional_id, service_id) values
  (:'umA', :'corte'),
  (:'umB', :'corte'),
  (:'umB', :'quimica');

------------------------------------------------- 1. o caminho normal

select is(
  (select count(*)::int
     from jsonb_array_elements(
       horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'corte'::uuid])
       ->'barbeiros')),
  3,
  'corte: os dois que fazem MAIS o que nao tem lista nenhuma'
);

--------------------------- 2. O CORACAO: quem nao faz, nao e oferecido

select ok(
  not exists (
    select 1 from jsonb_array_elements(
      horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])
      ->'barbeiros') b
     where b->>'nome' = 'Faz Corte'
  ),
  'quimica: quem NAO faz o servico sai da lista de vagas'
);

select is(
  (select b->>'nome'
     from jsonb_array_elements(
       horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])
       ->'barbeiros') b
    where b->>'nome' <> 'Sem Lista'),
  'Faz Corte Tambem',
  'e quem faz continua sendo oferecido, com o nome certo'
);

------------------------------- 3. pedir de proposito quem nao faz

select is(
  (horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid], :'umA')
    ->>'motivo'),
  'Esse barbeiro nao faz esse servico.',
  'pedindo o barbeiro que nao faz: recusa com motivo proprio'
);

-------------------- 4. a armadilha do zero: lista vazia = faz todos

select ok(
  exists (
    select 1 from jsonb_array_elements(
      horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])
      ->'barbeiros') b
     where b->>'nome' = 'Sem Lista'
  ),
  'barbeiro SEM nenhum servico ligado continua aparecendo: nao desaparece da agenda'
);

------------------- 5. ninguem faz: motivo proprio e SEM proximo dia

-- Fixture propria: tira a quimica de quem fazia, e da uma lista ao curinga para
-- ele parar de ser curinga. Sem isto a assercao herdaria estado e decidiria no
-- sorteio -- foi o que aconteceu no ensaio em producao.
delete from professional_services where service_id = :'quimica';
insert into professional_services (professional_id, service_id) values (:'semLista', :'corte');

select is(
  (horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])
    ->>'motivo'),
  'Nenhum barbeiro desta barbearia faz esse servico.',
  'ninguem faz o servico: motivo proprio, nao "sem vaga"'
);

select ok(
  not (horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'quimica'::uuid])
        ? 'proximo_dia_com_vaga'),
  'e NAO oferece outro dia: mudar o dia nao resolve servico que ninguem faz'
);

select * from finish();
rollback;
