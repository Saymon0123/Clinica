-- O barbeiro confirma o que ele faz (migration 0200).
--
-- ## O que este teste existe para impedir
--
-- A `salvar_servicos_do_barbeiro` troca a lista de serviços de alguém. Ela é
-- `security definer`, então **ignora RLS**: a única coisa entre um barbeiro e a
-- lista do colega é o `if` da autorização. As asserções 7 e 8 são o coração
-- deste arquivo -- barbeiro mexendo na lista de outro, e dono de outra
-- barbearia mexendo em quem não é dele. Se alguém afrouxar aquele `if`, é aqui
-- que cai, e não no dia em que um cliente for marcado com quem não faz o
-- serviço.
--
-- A asserção 3 guarda a regra que parece detalhe e não é: **lista vazia é
-- recusada**. Pela 0199, barbeiro sem nenhum serviço ligado conta como "faz
-- todos" -- então "desmarquei tudo" viraria "faço tudo", que é o contrário do
-- que a pessoa quis dizer.
--
-- E a 2 guarda a marca `servicos_confirmados_em`, que é o que distingue
-- "escolheu todos" de "nunca escolheu". Sem ela a tela de quem entrou com tudo
-- ligado pelo `accept-invite` fica idêntica à de quem decidiu -- o mesmo defeito
-- que o aviso "Ainda não salvo" do horário resolveu em 03/08.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(13);

\set salao_a 'aaaa2000-0000-0000-0000-000000000001'
\set salao_b 'aaaa2000-0000-0000-0000-000000000002'
\set dono_a  'aaaa2001-0000-0000-0000-000000000001'
\set dono_b  'aaaa2001-0000-0000-0000-000000000002'
\set login_barbeiro  'aaaa2002-0000-0000-0000-000000000001'
\set login_colega    'aaaa2002-0000-0000-0000-000000000002'
\set barbeiro 'aaaa2003-0000-0000-0000-000000000001'
\set colega   'aaaa2003-0000-0000-0000-000000000002'
\set corte    'aaaa2004-0000-0000-0000-000000000001'
\set barba    'aaaa2004-0000-0000-0000-000000000002'
\set sumido   'aaaa2004-0000-0000-0000-000000000003'
\set do_outro 'aaaa2004-0000-0000-0000-000000000004'

create or replace function pg_temp.entrar(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end; $$;

create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end; $$;

insert into salons (id, nome, ativo) values
  (:'salao_a', 'Barbearia A', true),
  (:'salao_b', 'Barbearia B', true);

-- `user_salons.user_id` tem FK para `auth.users`: sem estas linhas o CI reprova
-- com 23503 antes da primeira asserção. Eu tinha deduzido o contrário por ver os
-- inserts em `user_salons` de outros testes sem olhar o que vinha antes deles.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at) values
  (:'dono_a',         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.a.0200@teste.local', '', now(), now(), now()),
  (:'dono_b',         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.b.0200@teste.local', '', now(), now(), now()),
  (:'login_barbeiro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'barbeiro.0200@teste.local', '', now(), now(), now()),
  (:'login_colega',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'colega.0200@teste.local', '', now(), now(), now());

insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'login_barbeiro', :'salao_a', 'barbeiro'),
  (:'login_colega', :'salao_a', 'barbeiro'),
  (:'dono_b', :'salao_b', 'owner');

insert into professionals (id, salon_id, user_id, nome, ativo) values
  (:'barbeiro', :'salao_a', :'login_barbeiro', 'Quem Confirma', true),
  (:'colega',   :'salao_a', :'login_colega',   'O Colega',      true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo) values
  (:'corte',    :'salao_a', 'Corte',   30, 50, true),
  (:'barba',    :'salao_a', 'Barba',   20, 40, true),
  (:'sumido',   :'salao_a', 'Sumido',  30, 30, false),
  (:'do_outro', :'salao_b', 'Do Outro',30, 30, true);

-- O estado de entrada do accept-invite: tudo ligado, nada escolhido.
insert into professional_services (professional_id, service_id) values
  (:'barbeiro', :'corte'), (:'barbeiro', :'barba'),
  (:'colega',   :'corte'), (:'colega',   :'barba');

---------------------------------------------- 1 e 2. o dono troca a lista

select pg_temp.entrar(:'dono_a');
select lives_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L]::uuid[])$q$, :'barbeiro', :'corte'),
  'o dono troca a lista de servicos do barbeiro'
);

select is(
  (select count(*)::int from professional_services where professional_id = :'barbeiro'),
  1,
  'a lista nova SUBSTITUI a antiga, nao soma'
);

select ok(
  (select servicos_confirmados_em is not null from professionals where id = :'barbeiro'),
  'a marca de "alguem escolheu" e gravada: e o que distingue escolheu-tudo de nunca-escolheu'
);

------------------------------------------ 3. lista vazia e recusada

select throws_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[]::uuid[])$q$, :'barbeiro'),
  '22023', null,
  'lista VAZIA e recusada: pela 0199 ela seria lida como "faz todos"'
);

--------------------------- 4 e 5. servico de outro salao, e inativo

select throws_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L, %L]::uuid[])$q$,
         :'barbeiro', :'corte', :'do_outro'),
  '22023', null,
  'servico de OUTRA barbearia e recusado'
);

select throws_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L, %L]::uuid[])$q$,
         :'barbeiro', :'corte', :'sumido'),
  '22023', null,
  'servico INATIVO e recusado'
);

------------------------------------- 6. o proprio barbeiro pode

select pg_temp.sair();
select pg_temp.entrar(:'login_barbeiro');
select lives_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L, %L]::uuid[])$q$,
         :'barbeiro', :'corte', :'barba'),
  'o PROPRIO barbeiro confirma a lista dele: e disso que o onboarding depende'
);

------------- 7 e 8. O CORACAO: ninguem mexe na lista de quem nao e seu

select throws_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L]::uuid[])$q$, :'colega', :'corte'),
  '42501', null,
  'barbeiro NAO mexe na lista do colega, mesmo sendo da mesma barbearia'
);

select pg_temp.sair();
select pg_temp.entrar(:'dono_b');
select throws_ok(
  format($q$select salvar_servicos_do_barbeiro(%L, array[%L]::uuid[])$q$, :'barbeiro', :'corte'),
  '42501', null,
  'dono de OUTRA barbearia nao mexe em barbeiro que nao e dele'
);

--------------------- 9. a jornada tambem aceita o proprio barbeiro

select pg_temp.sair();
select pg_temp.entrar(:'login_barbeiro');
select lives_ok(
  format($q$select salvar_jornada(%L, %L::jsonb)$q$, :'barbeiro',
    (select jsonb_agg(jsonb_build_object('dia_semana', d, 'ativo', d between 1 and 5,
                                         'hora_inicio', '09:00', 'hora_fim', '18:00'))
       from generate_series(0, 6) d)),
  'o proprio barbeiro salva a jornada dele (antes da 0200 era so gestor)'
);

---------- 10 e 11. a marca da jornada: insert cru nao conta como escolha

-- As linhas de jornada que o `accept-invite` deriva do horario da barbearia
-- existem sem ninguem ter olhado. Se o insert cru marcasse, o cartao de
-- primeira entrada nasceria riscado e o barbeiro nunca veria o expediente que o
-- sistema inventou para ele.
select pg_temp.sair();
insert into professionals (id, salon_id, user_id, nome, ativo) values
  ('aaaa2003-0000-0000-0000-000000000003', :'salao_a', null, 'So Cadeira', true);
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select 'aaaa2003-0000-0000-0000-000000000003', d, '09:00', '18:00', true
  from generate_series(0, 6) d;

select ok(
  (select jornada_confirmada_em is null from professionals
    where id = 'aaaa2003-0000-0000-0000-000000000003'),
  'jornada DERIVADA (insert cru, como o accept-invite faz) nao conta como escolha'
);

select pg_temp.entrar(:'dono_a');
select ok(
  (select jornada_confirmada_em is not null from professionals where id = :'barbeiro'),
  'e a jornada SALVA pela RPC fica marcada: e o que risca o item do cartao'
);
select pg_temp.sair();

--------------------------------------------------------------- 12. o trinco

select ok(
  not has_function_privilege('anon',
        'public.salvar_servicos_do_barbeiro(uuid,uuid[])', 'execute')
  and has_function_privilege('authenticated',
        'public.salvar_servicos_do_barbeiro(uuid,uuid[])', 'execute'),
  'anon nao executa a RPC; authenticated executa, e a autorizacao mora dentro dela'
);

select * from finish();
rollback;
