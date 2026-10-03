-- Quem pode assumir o horário (migration 0202).
--
-- ## O que este teste existe para impedir
--
-- A função responde "quem pega este agendamento" para o dono que acabou de
-- registrar que um barbeiro não vem no dia. Ela é `security definer`, então
-- ignora RLS: a **asserção 6** é o coração -- dono de outra barbearia não
-- enxerga agendamento que não é dele.
--
-- E a **asserção 3** guarda a razão de a função existir: candidato é quem o
-- `horarios_livres` confirma naquele minuto exato. Se alguém trocar isso por uma
-- conta própria, a tela vai oferecer nomes que o trigger da folga (0134) depois
-- recusa com 23P01 -- o dono clica num barbeiro e leva erro, que é pior do que
-- não ter a lista.
--
-- Três coisas que o ensaio em produção ensinou, e que estão embutidas na
-- fixture aqui (cada uma derrubou uma tentativa):
--
-- 1. `trg_espelha_servico_principal` **já** grava o serviço principal em
--    `appointment_services`; inserir de novo levanta 23505.
-- 2. `bloqueio` não leva `client_id`: a EXCLUDE por CLIENTE também conta esse
--    status, e o mesmo cliente no mesmo minuto é recusado.
-- 3. A vítima do teste de "ocupado" sai da própria resposta da função, não de
--    um palpite: supor quem está livre bateu na agenda de verdade.
--
-- Fixture no relógio de São Paulo, nunca `current_date`.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao_a 'aaaa2200-0000-0000-0000-000000000001'
\set salao_b 'aaaa2200-0000-0000-0000-000000000002'
\set dono_a  'aaaa2201-0000-0000-0000-000000000001'
\set dono_b  'aaaa2201-0000-0000-0000-000000000002'
\set sai     'aaaa2202-0000-0000-0000-000000000001'
\set cobre   'aaaa2202-0000-0000-0000-000000000002'
\set folga   'aaaa2202-0000-0000-0000-000000000003'
\set naofaz  'aaaa2202-0000-0000-0000-000000000004'
\set corte   'aaaa2203-0000-0000-0000-000000000001'
\set quimica 'aaaa2203-0000-0000-0000-000000000002'
\set cliente 'aaaa2204-0000-0000-0000-000000000001'
\set ag      'aaaa2205-0000-0000-0000-000000000001'

create or replace function pg_temp.dia() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date + 1) $fn$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $fn$ select (pg_temp.dia()::text || ' ' || h)::timestamp
                            at time zone 'America/Sao_Paulo' $fn$;

create or replace function pg_temp.entrar(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end; $$;

create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
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
   'dono.a.0202@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.b.0202@teste.local', '', now(), now(), now());

insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'dono_b', :'salao_b', 'owner');

insert into professionals (id, salon_id, nome, ativo) values
  (:'sai',    :'salao_a', 'Quem Sai',      true),
  (:'cobre',  :'salao_a', 'Quem Cobre',    true),
  (:'folga',  :'salao_a', 'Quem Nao Vem',  true),
  (:'naofaz', :'salao_a', 'Quem Nao Faz',  true);

-- `folga` nao tem jornada no dia: e o caso de quem simplesmente nao trabalha.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
values (:'sai',    extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true),
       (:'cobre',  extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true),
       (:'naofaz', extract(dow from pg_temp.dia())::smallint, '08:00', '20:00', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',   :'salao_a', 'Corte',   30, 50,  true),
  (:'quimica', :'salao_a', 'Quimica', 60, 200, true);

-- `naofaz` faz so quimica; os outros fazem os dois.
insert into professional_services (professional_id, service_id) values
  (:'sai', :'corte'), (:'sai', :'quimica'),
  (:'cobre', :'corte'), (:'cobre', :'quimica'),
  (:'naofaz', :'quimica');

insert into clients (id, salon_id, nome, telefone) values
  (:'cliente', :'salao_a', 'Quem Vai Ser Realocado', '41977770031');

-- O agendamento no meio do dia. `appointment_services` NAO e preenchido a mao:
-- o trigger trg_espelha_servico_principal ja grava o servico principal, e
-- inserir de novo levanta 23505.
insert into appointments (id, salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem)
values (:'ag', :'salao_a', :'cliente', :'sai', :'corte', pg_temp.em('14:00'), 'agendado', 'crm');

select pg_temp.entrar(:'dono_a');

------------------------------------------- 1. quem cobre aparece

select ok(
  exists (select 1 from quem_pode_assumir(:'ag') where nome = 'Quem Cobre'),
  'quem trabalha no dia, faz o servico e esta livre naquela hora aparece'
);

------------------------------- 2. o proprio barbeiro nao e candidato

select ok(
  not exists (select 1 from quem_pode_assumir(:'ag') where nome = 'Quem Sai'),
  'o barbeiro do proprio agendamento nao aparece: realocar para ele mesmo nao e realocar'
);

------------- 3. O CORACAO: a candidatura passa pelo horarios_livres

-- Quem nao tem jornada no dia nao aparece. Se alguem trocar a regua por uma
-- conta propria, este nome volta -- e o trigger da folga (0134) recusaria o
-- update depois, com o dono ja tendo clicado.
select ok(
  not exists (select 1 from quem_pode_assumir(:'ag') where nome = 'Quem Nao Vem'),
  'quem nao trabalha nesse dia nao entra na lista (a regua e o horarios_livres)'
);

-- E quem esta OCUPADO naquele minuto sai. O bloqueio vai sem cliente: a EXCLUDE
-- por CLIENTE tambem conta o status `bloqueio`.
insert into appointments (salon_id, professional_id, service_id,
                          data_hora_inicio, data_hora_fim, status, origem)
values (:'salao_a', :'cobre', :'corte', pg_temp.em('14:00'), pg_temp.em('14:30'), 'bloqueio', 'crm');

select ok(
  not exists (select 1 from quem_pode_assumir(:'ag') where nome = 'Quem Cobre'),
  'candidato que ficou ocupado naquele minuto sai da lista'
);

-------------------------------- 4. quem nao faz o servico nao entra

select is(
  (select count(*)::int from quem_pode_assumir(:'ag')),
  0,
  'sobrou ninguem: quem nao faz o servico tambem nao entra, e a tela precisa dizer isso'
);

------------------------------- 5. bloqueio nao tem o que assumir

select is(
  (select count(*)::int from quem_pode_assumir(
     (select id from appointments where status = 'bloqueio' limit 1))),
  0,
  'bloqueio nao e agendamento: nao ha o que realocar'
);

------------- 6. O OUTRO CORACAO: dono de outra barbearia nao enxerga

select pg_temp.sair();
select pg_temp.entrar(:'dono_b');
select throws_ok(
  format($q$select * from quem_pode_assumir(%L)$q$, :'ag'),
  '42501', null,
  'dono de OUTRA barbearia nao ve quem pode assumir um agendamento que nao e dele'
);
select pg_temp.sair();

select * from finish();
rollback;
