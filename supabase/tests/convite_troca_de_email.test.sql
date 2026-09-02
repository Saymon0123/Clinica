-- Trocar o e-mail de um convite troca o link (migration 0128, passo 1.9).
--
-- O defeito que isto fecha: a tela fazia `update salon_invites set email = ...`
-- e mais nada. O link já enviado para o endereço errado continuava vivo — e
-- `accept-invite`, quando o e-mail novo ainda não tem conta, cria a conta com o
-- e-mail do convite e a senha de QUEM ABRIU. O destinatário errado virava o
-- barbeiro. Além disso o prazo não reiniciava e, como a fila do n8n
-- (`convites_a_enviar`) filtra `email_enviado_em is null`, o convidado novo
-- nunca recebia nada: a tela dizia "salvo" e não saía e-mail.
--
-- As quatro escritas — e-mail, token, prazo, fila — têm de andar juntas, e é
-- por isso que viraram RPC. A asserção que sustenta tudo é a última: sem o
-- `revoke update`, o caminho antigo continua aberto pela API e a RPC é enfeite.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(15);

\set salao_a  'ffff0000-0000-0000-0000-00000000000a'
\set salao_b  'ffff0000-0000-0000-0000-00000000000b'
\set dono_a   'ffff1111-0000-0000-0000-00000000000a'
\set barb_a   'ffff1111-0000-0000-0000-00000000000c'
\set dono_b   'ffff1111-0000-0000-0000-00000000000b'
\set convite  'ffff2222-0000-0000-0000-000000000001'
\set conv_dono 'ffff2222-0000-0000-0000-0000000000dd'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.a@teste.local', '', now(), now(), now()),
  (:'barb_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'barbeiro.a@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.b@teste.local', '', now(), now(), now());

insert into salons (id, nome) values (:'salao_a', 'Barbearia A'), (:'salao_b', 'Barbearia B');

insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'barb_a', :'salao_a', 'barbeiro'),
  (:'dono_b', :'salao_b', 'owner');

-- Convite que JÁ SAIU por e-mail (email_enviado_em preenchido) e que vence
-- amanhã: é o estado em que a troca de endereço é mais perigosa e mais inútil.
insert into salon_invites (id, salon_id, nome, email, role, email_enviado_em, expira_em) values
  (:'convite', :'salao_a', 'Barbeiro Convidado', 'errado@teste.local', 'barbeiro',
   now() - interval '1 hour', now() + interval '1 day');

-- Convite de dono nasce na operação, com prazo e dias de teste próprios.
insert into salon_invites (id, salon_id, nome, email, role, expira_em) values
  (:'conv_dono', :'salao_a', null, 'dono.novo@teste.local', 'owner', now() + interval '7 days');

create temp table resultado (chave text, valor text);
-- O bloco abaixo roda como `authenticated`: sem isto ele não escreve aqui.
grant all on resultado to authenticated;

do $$
declare
  v_token_inicial text;
  r record;
begin
  select token into v_token_inicial from public.salon_invites
   where id = 'ffff2222-0000-0000-0000-000000000001';
  insert into resultado values ('token_inicial', v_token_inicial);

  -- ---- dono do salão A troca o destinatário -------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ffff1111-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

  select * into r from public.trocar_email_do_convite(
    'ffff2222-0000-0000-0000-000000000001', 'Certo@Teste.Local');
  insert into resultado values
    ('troca_trocou', r.trocou::text),
    ('troca_token_mudou', (r.novo_token <> v_token_inicial)::text),
    ('troca_prazo_renovado', (r.novo_prazo > now() + interval '6 days')::text),
    ('token_depois', r.novo_token);

  -- ---- o caminho antigo, que a RPC veio substituir ------------------------
  begin
    update public.salon_invites set token = 'escolhido-a-mao'
     where id = 'ffff2222-0000-0000-0000-000000000001';
    insert into resultado values ('update_direto', 'PASSOU');
  exception when others then
    insert into resultado values ('update_direto', sqlstate);
  end;

  -- ---- mesmo endereço é reenvio, não troca --------------------------------
  select * into r from public.trocar_email_do_convite(
    'ffff2222-0000-0000-0000-000000000001', 'certo@teste.local');
  insert into resultado values
    ('reenvio_trocou', r.trocou::text),
    ('reenvio_token_igual', (r.novo_token = (select valor from resultado where chave = 'token_depois'))::text);

  -- ---- convite de dono não é da barbearia ---------------------------------
  begin
    perform public.trocar_email_do_convite(
      'ffff2222-0000-0000-0000-0000000000dd', 'outro@teste.local');
    insert into resultado values ('convite_de_dono', 'PASSOU');
  exception when others then
    insert into resultado values ('convite_de_dono', sqlstate);
  end;

  -- ---- e-mail sem cara de e-mail ------------------------------------------
  begin
    perform public.trocar_email_do_convite(
      'ffff2222-0000-0000-0000-000000000001', 'sem-arroba');
    insert into resultado values ('email_invalido', 'PASSOU');
  exception when others then
    insert into resultado values ('email_invalido', sqlstate);
  end;

  -- ---- barbeiro do próprio salão não gerencia convite ---------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ffff1111-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
  begin
    perform public.trocar_email_do_convite(
      'ffff2222-0000-0000-0000-000000000001', 'barbeiro.tentou@teste.local');
    insert into resultado values ('barbeiro', 'PASSOU');
  exception when others then
    insert into resultado values ('barbeiro', sqlstate);
  end;

  -- ---- dono de OUTRA barbearia --------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ffff1111-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
  begin
    perform public.trocar_email_do_convite(
      'ffff2222-0000-0000-0000-000000000001', 'invasor@teste.local');
    insert into resultado values ('outro_salao', 'PASSOU');
  exception when others then
    insert into resultado values ('outro_salao', sqlstate);
  end;

  -- ---- convite de DONO pela API: escalada de gerente para dono -----------
  -- O revoke de UPDATE fechava metade. O INSERT continuava solto, e a policy
  -- de 0017 vale para gerente: dava para criar um convite role='owner' para si
  -- mesmo, ler o token no proprio insert e virar dono da barbearia.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ffff1111-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
  begin
    insert into public.salon_invites (salon_id, nome, email, role)
    values ('ffff0000-0000-0000-0000-00000000000a', 'Eu mesmo', 'escalada@teste.local', 'owner');
    insert into resultado values ('insert_owner', 'PASSOU');
  exception when others then
    insert into resultado values ('insert_owner', sqlstate);
  end;

  -- Coluna fora do grant: escolher o token a mao daria um link previsivel.
  begin
    insert into public.salon_invites (salon_id, nome, email, role, token)
    values ('ffff0000-0000-0000-0000-00000000000a', 'Token', 'token@teste.local', 'barbeiro', 'escolhido');
    insert into resultado values ('insert_token', 'PASSOU');
  exception when others then
    insert into resultado values ('insert_token', sqlstate);
  end;

  -- O caminho legitimo do CRM continua passando: as cinco colunas que a tela
  -- de convite realmente preenche.
  begin
    insert into public.salon_invites (salon_id, nome, email, role, comissao_percentual)
    values ('ffff0000-0000-0000-0000-00000000000a', 'Barbeiro Novo', 'legitimo@teste.local', 'barbeiro', 50);
    insert into resultado values ('insert_legitimo', 'OK');
  exception when others then
    insert into resultado values ('insert_legitimo', sqlstate);
  end;

  -- ---- barbearia DESLIGADA pela operacao ---------------------------------
  -- is_manager() le so user_salons e nunca olha salons.ativo; quem olha e
  -- salon_ids(). A RPC precisa dos dois termos, como a policy que ela
  -- substitui -- senao desligar a barbearia deixa de cortar o acesso.
  perform set_config('role', 'postgres', true);
  update public.salons set ativo = false where id = 'ffff0000-0000-0000-0000-00000000000a';
  perform set_config('role', 'authenticated', true);
  begin
    perform public.trocar_email_do_convite(
      'ffff2222-0000-0000-0000-000000000001', 'desligada@teste.local');
    insert into resultado values ('salao_desativado', 'PASSOU');
  exception when others then
    insert into resultado values ('salao_desativado', sqlstate);
  end;

  perform set_config('role', 'postgres', true);
  update public.salons set ativo = true where id = 'ffff0000-0000-0000-0000-00000000000a';
  perform set_config('request.jwt.claims', '', true);
end $$;

select is((select valor from resultado where chave = 'troca_trocou'), 'true',
  'endereco diferente e reportado como troca');

select is((select valor from resultado where chave = 'troca_token_mudou'), 'true',
  'trocar o destinatario gera token novo');

select is((select valor from resultado where chave = 'troca_prazo_renovado'), 'true',
  'o prazo reinicia em 7 dias -- senao o convidado novo recebe um link que morre amanha');

select is(
  (select count(*) from salon_invites
    where token = (select valor from resultado where chave = 'token_inicial'))::int,
  0,
  'o token antigo nao resolve mais nenhuma linha');

-- `null::timestamptz` e não `null` puro: `is()` é polimórfica e um NULL sem
-- tipo a deixa ambígua.
select is(
  (select email_enviado_em from salon_invites where id = 'ffff2222-0000-0000-0000-000000000001'),
  null::timestamptz,
  'o convite volta para a fila de e-mail do n8n');

select is(
  (select count(*) from convites_a_enviar where id = 'ffff2222-0000-0000-0000-000000000001')::int,
  1,
  'e reaparece de fato em convites_a_enviar');

select is((select valor from resultado where chave = 'reenvio_trocou'), 'false',
  'mesmo endereco e reenvio, nao troca');

select is((select valor from resultado where chave = 'reenvio_token_igual'), 'true',
  'reenvio mantem o token -- o link que o dono ja mandou pelo WhatsApp continua valendo');

select is((select valor from resultado where chave = 'convite_de_dono'), '42501',
  'convite de dono e trocado pela operacao, nao pela barbearia');

select is((select valor from resultado where chave = 'email_invalido'), '22023',
  'e-mail sem arroba e recusado');

-- A que sustenta todas as outras: sem o revoke, a RPC seria enfeite ao lado de
-- uma parede que não existe.
select is(
  (select string_agg(valor, ' ' order by chave)
     from resultado where chave in ('update_direto', 'barbeiro', 'outro_salao')),
  '42501 42501 42501',
  'update direto, barbeiro e dono de outro salao: todos barrados com 42501');

select is((select valor from resultado where chave = 'insert_owner'), '42501',
  'gerente nao cria convite de dono para si mesmo pela API');

select is((select valor from resultado where chave = 'insert_token'), '42501',
  'ninguem escolhe o token do convite a mao');

select is((select valor from resultado where chave = 'insert_legitimo'), 'OK',
  'o convite normal do CRM continua passando');

select is((select valor from resultado where chave = 'salao_desativado'), '42501',
  'desligar a barbearia corta a troca de convite na hora');

select * from finish();
rollback;
