-- O dono que não atende vira barbeiro sem convite (migration 0133, passo 2.7 — achado 24).
--
-- Três escritas que só fazem sentido juntas — profissional, jornada derivada do
-- horário do salão e vínculo com os serviços — numa RPC, para o barbeiro nunca
-- nascer pela metade. E só para quem está chamando: a policy de
-- `professionals` deixaria o gestor gravar qualquer user_id; a RPC não.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set salao   'dddd9000-0000-0000-0000-00000000000a'
\set outro   'dddd9000-0000-0000-0000-00000000000b'
\set dono    'dddd9111-0000-0000-0000-00000000000a'
\set gerente 'dddd9111-0000-0000-0000-00000000000c'
\set dono_b  'dddd9111-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono@teste.local', '', now(), now(), now()),
  (:'gerente', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.b@teste.local', '', now(), now(), now());

-- Terça com `abre` vazio de propósito: é o dado que a 0125 encontrou em
-- produção. Tem de virar "dia sem jornada", não cadastro que falha.
insert into salons (id, nome, horario_funcionamento) values
  (:'salao', 'Barbearia do Dono', '{
     "dom": null,
     "seg": {"abre": "09:00", "fecha": "19:00"},
     "ter": {"abre": "", "fecha": "19:00"},
     "qua": {"abre": "09:00", "fecha": "19:00"},
     "qui": {"abre": "09:00", "fecha": "19:00"},
     "sex": {"abre": "09:00", "fecha": "20:00"},
     "sab": {"abre": "09:00", "fecha": "18:00"}
   }'::jsonb),
  (:'outro', 'Outra Barbearia', null);

insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'salao', 'owner'),
  (:'gerente', :'salao', 'gerente'),
  (:'dono_b', :'outro', 'owner');

insert into services (salon_id, nome, duracao_minutos, preco, ativo) values
  (:'salao', 'Corte', 40, 45, true),
  (:'salao', 'Barba', 30, 35, true),
  (:'salao', 'Antigo', 30, 30, false);

create temp table resultado (chave text, valor text);
grant all on resultado to authenticated;

create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare v_id uuid;
begin
  perform pg_temp.entrar_como('dddd9111-0000-0000-0000-00000000000a');   -- dono
  v_id := public.quero_atender('dddd9000-0000-0000-0000-00000000000a', '  Dono Barbeiro  ', '(41) 98888-7777');
  insert into resultado values ('id', v_id::text);
  insert into resultado select 'nome', nome from public.professionals where id = v_id;
  insert into resultado select 'user_id_e_o_dono', (user_id = 'dddd9111-0000-0000-0000-00000000000a')::text from public.professionals where id = v_id;
  insert into resultado select 'jornadas', count(*)::text from public.professional_schedules where professional_id = v_id;
  insert into resultado select 'terca_sem_jornada', (count(*) = 0)::text from public.professional_schedules where professional_id = v_id and dia_semana = 2;
  insert into resultado select 'sexta', hora_inicio::text || '-' || hora_fim::text from public.professional_schedules where professional_id = v_id and dia_semana = 5;
  insert into resultado select 'servicos', count(*)::text from public.professional_services where professional_id = v_id;

  begin
    perform public.quero_atender('dddd9000-0000-0000-0000-00000000000a', 'De novo', null);
    insert into resultado values ('segunda_vez', 'PASSOU');
  exception when others then insert into resultado values ('segunda_vez', sqlstate); end;

  perform pg_temp.entrar_como('dddd9111-0000-0000-0000-00000000000c');   -- gerente do mesmo salão
  begin
    perform public.quero_atender('dddd9000-0000-0000-0000-00000000000a', 'Gerente', null);
    insert into resultado values ('gerente', 'PASSOU');
  exception when others then insert into resultado values ('gerente', sqlstate); end;

  perform pg_temp.entrar_como('dddd9111-0000-0000-0000-00000000000b');   -- dono de OUTRA
  begin
    perform public.quero_atender('dddd9000-0000-0000-0000-00000000000a', 'Invasor', null);
    insert into resultado values ('outro_dono', 'PASSOU');
  exception when others then insert into resultado values ('outro_dono', sqlstate); end;
  begin
    perform public.quero_atender('dddd9000-0000-0000-0000-00000000000b', '   ', null);
    insert into resultado values ('sem_nome', 'PASSOU');
  exception when others then insert into resultado values ('sem_nome', sqlstate); end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select is((select valor from resultado where chave = 'nome'), 'Dono Barbeiro',
  'o nome entra sem os espacos das pontas');

select is((select valor from resultado where chave = 'user_id_e_o_dono'), 'true',
  'o profissional e de quem chamou -- nunca de outro user_id');

select is((select valor from resultado where chave = 'jornadas'), '5',
  'jornada derivada do horario do salao: 5 dias (domingo fechado, terca quebrada)');

select is((select valor from resultado where chave = 'terca_sem_jornada'), 'true',
  'dia com hora vazia vira dia sem jornada, nao cadastro que falha');

select is((select valor from resultado where chave = 'sexta'), '09:00:00-20:00:00',
  'a jornada copia o horario do dia, nao um padrao fixo');

select is((select valor from resultado where chave = 'servicos'), '2',
  'vinculado a todos os servicos ATIVOS, e so a eles');

select is((select valor from resultado where chave = 'segunda_vez'), '22023',
  'quem ja atende nao ganha um segundo cadastro');

select is((select valor from resultado where chave = 'gerente'), '42501',
  'gerente nao se cadastra como barbeiro por aqui -- e o dono que convida');

select is((select valor from resultado where chave = 'outro_dono'), '42501',
  'dono de outra barbearia nao entra nesta');

select is((select valor from resultado where chave = 'sem_nome'), '22023',
  'nome em branco e recusado');

-- Nada pela metade: um profissional criado pela RPC sempre tem vinculo com
-- servico (o agente precisa dele para oferecer o barbeiro).
select is(
  (select count(*)::int from professionals p
    where p.salon_id = :'salao' and p.user_id = :'dono'
      and not exists (select 1 from professional_services ps where ps.professional_id = p.id)),
  0,
  'o barbeiro nunca nasce sem servico'
);

select * from finish();
rollback;
