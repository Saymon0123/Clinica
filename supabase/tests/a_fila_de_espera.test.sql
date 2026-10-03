-- A fila de espera (migrations 0203 e 0204).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 10 é o trinco**, e ela existe por causa de um susto real: a
-- tabela nasceu com DELETE/INSERT/UPDATE/TRUNCATE para `anon` pelo padrão de
-- privilégios do schema, e o `grant select` que a 0203 escreveu não era o único
-- grant que existia -- era o único que eu tinha visto. Medido na hora: a RLS
-- segurava (anon lia 0 linhas e o insert era recusado), então não havia buraco.
-- A 0204 apertou o trinco, e esta asserção é o que impede ele de afrouxar de
-- novo em silêncio.
--
-- **A asserção 11 é o isolamento**: a fila é dado de barbearia, e dono de outra
-- não enxerga uma linha.
--
-- E a **asserção 8** guarda a decisão mais fácil de desfazer sem perceber: quem
-- sai da fila com vaga segurada devolve a vaga **na hora**, em vez de esperar a
-- varredura. Trinta minutos de horário preso para quem acabou de dizer que não
-- quer pode ser o horário da próxima pessoa da fila.
--
-- Fixture no relógio de São Paulo, e o dia com vaga é **procurado**, nunca
-- suposto: no ensaio em produção a primeira versão pediu "amanhã" num sábado, e
-- amanhã era domingo com a barbearia fechada.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(14);

\set salao_a 'aaaa2300-0000-0000-0000-000000000001'
\set salao_b 'aaaa2300-0000-0000-0000-000000000002'
\set dono_a  'aaaa2301-0000-0000-0000-000000000001'
\set dono_b  'aaaa2301-0000-0000-0000-000000000002'
\set prof    'aaaa2302-0000-0000-0000-000000000001'
\set corte   'aaaa2303-0000-0000-0000-000000000001'
\set sumido  'aaaa2303-0000-0000-0000-000000000002'
\set cli     'aaaa2304-0000-0000-0000-000000000001'
\set cli2    'aaaa2304-0000-0000-0000-000000000002'
\set cli3    'aaaa2304-0000-0000-0000-000000000003'

create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

-- `entrar` troca a claim E o PAPEL. So a claim nao bastaria: o runner do pgTAP
-- roda como superusuario, que ignora RLS -- a assercao 11 contaria as linhas de
-- todas as barbearias e passaria por engano. Varios testes da casa fazem assim
-- (agenda_publica_ligavel, convite_troca_de_email).
create or replace function pg_temp.entrar(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;

create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao_a', 'Barbearia A', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00'))),
       (:'salao_b', 'Barbearia B', true, 0, '{}'::jsonb);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at) values
  (:'dono_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.a.0203@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.b.0203@teste.local', '', now(), now(), now());

insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'dono_b', :'salao_b', 'owner');

insert into professionals (id, salon_id, nome, ativo) values
  (:'prof', :'salao_a', 'Quem Atende', true);

-- Jornada em TODOS os dias: o teste precisa de um dia com vaga amanhã, e
-- barbearia fechada no dia seguinte foi o que derrubou o ensaio em produção.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'prof', d, '08:00', '20:00', true from generate_series(0, 6) d;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',  :'salao_a', 'Corte',  30, 50, true),
  (:'sumido', :'salao_a', 'Sumido', 30, 50, false);

insert into clients (id, salon_id, nome, telefone) values
  (:'cli',  :'salao_a', 'Quem Espera',       '41977770041'),
  (:'cli2', :'salao_a', 'Quem Espera Dois',  '41977770042'),
  (:'cli3', :'salao_a', 'Quem So Pode Cedo', '41977770043');

--------------------------------------------- 1 a 4. os quatro CHECKs

select throws_ok(
  format($q$insert into fila_de_espera (salon_id, client_id, de, ate, status)
            values (%L, %L, %s, %s, 'inventado')$q$,
         :'salao_a', :'cli', 'pg_temp.hoje()', 'pg_temp.hoje()'),
  '23514', null,
  'status fora da lista e recusado'
);

select throws_ok(
  format($q$insert into fila_de_espera (salon_id, client_id, de, ate)
            values (%L, %L, %s + 5, %s)$q$,
         :'salao_a', :'cli', 'pg_temp.hoje()', 'pg_temp.hoje()'),
  '23514', null,
  'faixa invertida (ate antes de de) e recusada'
);

-- MEIA JANELA E ACEITA (0208), e esta assercao e o oposto da que existia aqui.
--
-- A 0203 exigia as duas pontas, com o comentario "meia janela e filtro que
-- ninguem le". E falso: "antes das 9" e "depois das 18" sao as duas restricoes
-- que cliente mais diz. A primeira frase de cliente de verdade num teste do
-- agente -- "so consigo antes das 9" -- foi recusada com 23514, e a funcao que
-- procura a vaga JA tratava as pontas de forma independente.
select lives_ok(
  format($q$insert into fila_de_espera (salon_id, client_id, de, ate, hora_ate)
            values (%L, %L, %s, %s, '09:00')$q$,
         :'salao_a', :'cli3', 'pg_temp.hoje()', 'pg_temp.hoje()'),
  'meia janela ("so ate as 09:00") e ACEITA: ponta nula e ponta aberta'
);

select throws_ok(
  format($q$insert into fila_de_espera (salon_id, client_id, de, ate, hora_de, hora_ate)
            values (%L, %L, %s, %s, '18:00', '09:00')$q$,
         :'salao_a', :'cli', 'pg_temp.hoje()', 'pg_temp.hoje()'),
  '23514', null,
  'mas com as DUAS pontas, fim antes do comeco continua recusado'
);

select throws_ok(
  format($q$insert into fila_de_espera (salon_id, client_id, de, ate, status)
            values (%L, %L, %s, %s, 'saiu')$q$,
         :'salao_a', :'cli', 'pg_temp.hoje()', 'pg_temp.hoje()'),
  '23514', null,
  'encerrada SEM encerrada_em e recusada: ninguem saberia quando saiu'
);

------------------------------------------- 5 e 6. entrar na fila

select ok(
  (entrar_na_fila(:'salao_a', :'cli', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6, null, null, :'prof', 'agente')
    ->>'ok')::boolean,
  'o cliente entra na fila com servico, faixa de dias e barbeiro de preferencia'
);

select is(
  (select count(*)::int from fila_de_espera_servicos s
     join fila_de_espera f on f.id = s.fila_id
    where f.client_id = :'cli'),
  1,
  'o servico vai para a tabela filha, como em appointment_services'
);

------------------------- 7. duas inscricoes vivas, nao

select is(
  (entrar_na_fila(:'salao_a', :'cli', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'motivo'),
  'Esse cliente ja esta na fila.',
  '"me avisa se abrir" dito duas vezes nao cria duas inscricoes'
);

--------------- 8. O CORACAO: sair devolve a vaga segurada NA HORA

-- O dia com vaga e PROCURADO, nao suposto. Aqui a jornada cobre os 7 dias, mas
-- a regra fica escrita: no ensaio em producao supor "amanha" caiu num domingo
-- com a barbearia fechada.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem, reservada_ate)
select 'aaaa2305-0000-0000-0000-000000000001', :'salao_a', :'cli', :'prof', :'corte',
       h.inicio, 'reservado', 'fila', now() + interval '30 minutes'
  from horarios_livres(:'salao_a', pg_temp.hoje() + 1, 30, :'prof') h
 order by h.inicio limit 1;

update fila_de_espera
   set status = 'chamado', chamada_em = now(),
       appointment_id = 'aaaa2305-0000-0000-0000-000000000001'
 where client_id = :'cli';

-- A chamada roda numa instrucao SO, e o resultado fica guardado.
--
-- A primeira versao desta assercao juntava a chamada e a consequencia num `and`
-- unico -- `sair_da_fila(...) and not exists(...)` -- e o CI reprovou. SQL **nao
-- garante a ordem de avaliacao** de um `and`: o `not exists` foi medido ANTES de
-- a funcao apagar a reserva. E a mesma licao que ja esta escrita em
-- `a_vaga_segurada_para_quem_foi_chamado.test.sql`, e eu a repeti aqui -- motivo
-- de ela estar escrita duas vezes agora.
create temp table saida as
select sair_da_fila((select id from fila_de_espera where client_id = :'cli')) as r;

select ok(
  ((select r from saida)->>'vaga_devolvida')::boolean,
  'sair da fila com vaga segurada devolve a vaga (vaga_devolvida: true)'
);

select ok(
  not exists (select 1 from appointments
               where id = 'aaaa2305-0000-0000-0000-000000000001'),
  'e a reserva e apagada NA HORA, sem esperar a varredura: o horario pode ser o da proxima pessoa'
);

--------------------------- 9. sair duas vezes e conversa, nao erro

select is(
  (sair_da_fila((select id from fila_de_espera where client_id = :'cli'))->>'ok'),
  'false',
  'sair de novo volta ok:false, nao excecao: as duas portas chamam isto'
);

--------------------------------------------- 10. O TRINCO

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('fila_de_espera', 'fila_de_espera_servicos')
       and grantee = 'anon'
  )
  and not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('fila_de_espera', 'fila_de_espera_servicos')
       and grantee = 'authenticated'
       and privilege_type <> 'SELECT'
  )
  and not has_function_privilege('anon',
        'public.entrar_na_fila(uuid,uuid,uuid[],date,date,time,time,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.sair_da_fila(uuid,text)', 'execute'),
  'anon sem nenhum grant, authenticated so com SELECT, e as duas RPCs fechadas para anon'
);

------------------------------------ 11. o isolamento entre barbearias

select ok(
  (entrar_na_fila(:'salao_a', :'cli2', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 2)->>'ok')::boolean,
  'uma inscricao viva para o segundo cliente, para o dono de fora tentar ler'
);

select pg_temp.entrar(:'dono_b');
select is(
  (select count(*)::int from fila_de_espera),
  0,
  'dono de OUTRA barbearia nao enxerga inscricao nenhuma'
);
select pg_temp.sair();

select * from finish();
rollback;
