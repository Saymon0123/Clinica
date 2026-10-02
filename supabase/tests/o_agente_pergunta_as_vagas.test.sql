-- O agente pergunta as vagas, em vez de calcular (migration 0198).
--
-- ## O que este teste existe para impedir
--
-- Antes da 0198 o agente montava a lista de horarios no MODELO: pegava a jornada
-- numa ferramenta, os agendamentos crus em outra, e procurava os buracos. Essa
-- conta ignorava folga entre atendimentos, bloqueio do barbeiro, fechamento da
-- loja e a vaga `reservado` -- e custava quatro voltas ao modelo por mensagem,
-- ~50 mil tokens contra um teto de 30 mil por minuto.
--
-- A `horarios_livres_pelo_agente` acaba com isso porque faz duas coisas que o
-- agente nao sabe fazer: SOMA a duracao dos servicos (ele conhece servicos, nao
-- minutos) e devolve a lista pronta, agrupada por barbeiro, com o
-- `professional_id` que o `agendar_pelo_agente` exige.
--
-- **A assercao 3 e o coracao deste arquivo.** Ela compara a resposta compacta com
-- a `horarios_livres` crua e exige que nenhuma vaga tenha se perdido no caminho.
-- O dia em que alguem mexer no agrupamento e deixar horario de fora, o cliente
-- recebe menos opcoes do que existem e ninguem percebe -- a nao ser aqui.
--
-- A assercao 5 guarda o outro lado: a resposta NAO pode trazer
-- `duracao_minutos`. O prompt proibe falar de duracao com o cliente, e dado que
-- chega ao modelo e dado que vaza na conversa.
--
-- Fixture no relogio de Sao Paulo, nunca `current_date`: o runner do CI vive em
-- UTC e o teste passaria de dia e quebraria de madrugada.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

\set salao   'aaaa1980-0000-0000-0000-000000000001'
\set prof    'aaaa1981-0000-0000-0000-000000000001'
\set outro   'aaaa1981-0000-0000-0000-000000000002'
\set curto   'aaaa1982-0000-0000-0000-000000000001'
\set longo   'aaaa1982-0000-0000-0000-000000000002'
\set inativo 'aaaa1982-0000-0000-0000-000000000003'

create or replace function pg_temp.dia() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia das Vagas', true, 10,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','09:00','fecha','18:00'),
          'seg', jsonb_build_object('abre','09:00','fecha','18:00'),
          'ter', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qua', jsonb_build_object('abre','09:00','fecha','18:00'),
          'qui', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sex', jsonb_build_object('abre','09:00','fecha','18:00'),
          'sab', jsonb_build_object('abre','09:00','fecha','18:00')));

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof',  :'salao', 'Barbeiro da Manha', true),
  (:'outro', :'salao', 'Barbeiro da Tarde', true);

-- A jornada e o denominador de horarios_livres: sem ela nao ha vaga nenhuma e as
-- assercoes passariam por vazio.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values (:'prof',  extract(dow from pg_temp.dia())::smallint, '09:00', '18:00', true),
       (:'outro', extract(dow from pg_temp.dia())::smallint, '09:00', '18:00', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'curto',   :'salao', 'Pezinho',  15, 25, true),
  (:'longo',   :'salao', 'Corte',    40, 55, true),
  (:'inativo', :'salao', 'Sumido',   30, 30, false);

--------------------------------------------- 1. a resposta tem a forma esperada

select ok(
  (public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'curto'::uuid])->>'ok')::boolean
  and jsonb_array_length(
        public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'curto'::uuid])->'barbeiros'
      ) = 2,
  'um servico, amanha: ok true e os DOIS barbeiros que trabalham no dia'
);

----------------------------------- 2. o professional_id vem junto, e e de verdade

select ok(
  exists (
    select 1
      from jsonb_array_elements(
             public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'curto'::uuid])
             ->'barbeiros') b
      join public.professionals p on p.id = (b->>'professional_id')::uuid
     where p.salon_id = :'salao'
  ),
  'cada barbeiro vem com professional_id de verdade: e dele que o agendar_pelo_agente tira o barbeiro'
);

--------------------------- 3. O CORACAO: nada se perde no agrupamento

-- A resposta compacta tem de conter EXATAMENTE as vagas que a regua oficial
-- devolve -- nem uma a menos.
select is(
  (select sum(array_length(string_to_array(b->>'horas', ', '), 1))::int
     from jsonb_array_elements(
            public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'longo'::uuid])
            ->'barbeiros') b),
  (select count(*)::int from horarios_livres(:'salao', pg_temp.dia(), 40, null)),
  'a resposta agrupada tem as MESMAS vagas que horarios_livres: nada se perde no caminho'
);

------------------------------------- 4. a soma da duracao acontece aqui

-- Dois servicos ocupam 55 minutos (15 + 40), e por isso cabem menos vezes no dia
-- do que um de 15. Se a soma deixar de ser feita, este numero empata.
select cmp_ok(
  (select sum(array_length(string_to_array(b->>'horas', ', '), 1))::int
     from jsonb_array_elements(
            public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(),
              array[:'curto'::uuid, :'longo'::uuid])->'barbeiros') b),
  '<',
  (select sum(array_length(string_to_array(b->>'horas', ', '), 1))::int
     from jsonb_array_elements(
            public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(),
              array[:'curto'::uuid])->'barbeiros') b),
  'dois servicos somam a duracao: cabem menos vagas que um servico so'
);

-------------------------------------- 5. a duracao NAO volta para o modelo

select ok(
  (public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'longo'::uuid])
    ->> 'duracao_minutos') is null,
  'a resposta nao traz duracao_minutos: o prompt proibe dizer duracao ao cliente'
);

------------------------------------------ 6. filtrar por barbeiro

select is(
  (public.horarios_livres_pelo_agente(:'salao', pg_temp.dia(), array[:'curto'::uuid], :'prof')
    ->'barbeiros'->0->>'nome'),
  'Barbeiro da Manha',
  'com professional_id, volta so aquele barbeiro'
);

----------------------------- 7 e 8. recusa de negocio x chamada malfeita

-- Dia que passou e conversa ("o cliente disse sexta pensando na que vem").
select ok(
  not (public.horarios_livres_pelo_agente(:'salao', pg_temp.dia() - 30, array[:'curto'::uuid])
        ->>'ok')::boolean,
  'dia que ja passou volta como ok false, para o agente conversar - nao como erro'
);

-- Servico inativo e chamada malfeita: o agente nao deveria nem ter o id.
select throws_ok(
  format($q$select public.horarios_livres_pelo_agente(%L, %s, array[%L]::uuid[])$q$,
         :'salao', quote_literal(pg_temp.dia()) || '::date', :'inativo'),
  '22023', null,
  'servico inativo levanta excecao: id que o agente nao deveria ter e chamada malfeita'
);

--------------------------------------------------------------- 9. o trinco

select ok(
  not has_function_privilege('anon',
        'public.horarios_livres_pelo_agente(uuid,date,uuid[],uuid)', 'execute')
  and not has_function_privilege('authenticated',
        'public.horarios_livres_pelo_agente(uuid,date,uuid[],uuid)', 'execute')
  and has_function_privilege('service_role',
        'public.horarios_livres_pelo_agente(uuid,date,uuid[],uuid)', 'execute'),
  'so o service_role chama: a funcao nova nao ficou com execute para todos'
);

select * from finish();
rollback;
