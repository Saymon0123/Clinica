-- A agenda pública nasce ligada e só o gestor desliga (migration 0138).
--
-- Antes, `agenda_publica` tinha `padrao = false` e nenhum lugar do sistema
-- escrevia em `recursos_do_salao`: o dono não conseguia ligar nem descobrir que
-- existia. A 0138 inverteu o padrão e abriu UMA porta — esta RPC —, em vez de
-- uma policy que deixaria o gestor mexer em qualquer chave do catálogo.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(8);

\set salao    'cccc9000-0000-0000-0000-00000000000a'
\set outro    'cccc9000-0000-0000-0000-00000000000b'
\set dono     'cccc9111-0000-0000-0000-00000000000a'
\set barbeiro 'cccc9111-0000-0000-0000-00000000000b'
\set estranho 'cccc9111-0000-0000-0000-00000000000c'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.qr@teste.local', '', now(), now(), now()),
  (:'barbeiro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barbeiro.qr@teste.local', '', now(), now(), now()),
  (:'estranho', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'estranho.qr@teste.local', '', now(), now(), now());

insert into salons (id, nome) values
  (:'salao', 'Barbearia do QR'),
  (:'outro', 'Barbearia Alheia');

insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'salao', 'owner'),
  (:'barbeiro', :'salao', 'barbeiro'),
  (:'estranho', :'outro', 'owner');

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

-- ---------------------------------------------------------------------------
-- O padrão: sem linha própria, a barbearia já nasce com o QR ligado.
-- ---------------------------------------------------------------------------

select is(
  (select padrao from recursos where chave = 'agenda_publica'),
  true,
  'o recurso agenda_publica tem padrao ligado'
);

select is(
  (select ativo from recursos_ativos where salon_id = :'salao' and recurso = 'agenda_publica'),
  true,
  'barbearia sem linha propria ja aparece com o QR ligado'
);

-- ---------------------------------------------------------------------------
-- Quem pode e quem não pode
-- ---------------------------------------------------------------------------

do $$
begin
  -- Gestor da própria barbearia: desliga.
  perform pg_temp.entrar_como('cccc9111-0000-0000-0000-00000000000a');
  begin
    perform public.definir_agenda_publica('cccc9000-0000-0000-0000-00000000000a', false);
    insert into resultado values ('dono_desliga', 'OK');
  exception when others then insert into resultado values ('dono_desliga', sqlstate); end;

  -- Barbeiro da mesma barbearia: configuração não é com ele.
  perform pg_temp.entrar_como('cccc9111-0000-0000-0000-00000000000b');
  begin
    perform public.definir_agenda_publica('cccc9000-0000-0000-0000-00000000000a', true);
    insert into resultado values ('barbeiro', 'PASSOU');
  exception when others then insert into resultado values ('barbeiro', sqlstate); end;

  -- Dono de OUTRA barbearia mexendo nesta: o caso que a policy sozinha
  -- deixaria passar se alguém errasse o `using`.
  perform pg_temp.entrar_como('cccc9111-0000-0000-0000-00000000000c');
  begin
    perform public.definir_agenda_publica('cccc9000-0000-0000-0000-00000000000a', true);
    insert into resultado values ('estranho', 'PASSOU');
  exception when others then insert into resultado values ('estranho', sqlstate); end;

  -- Argumento nulo não vira linha meia-boca no banco.
  perform pg_temp.entrar_como('cccc9111-0000-0000-0000-00000000000a');
  begin
    perform public.definir_agenda_publica('cccc9000-0000-0000-0000-00000000000a', null);
    insert into resultado values ('nulo', 'PASSOU');
  exception when others then insert into resultado values ('nulo', sqlstate); end;

  -- E religar tem de funcionar: desligar sem volta seria outro beco.
  begin
    perform public.definir_agenda_publica('cccc9000-0000-0000-0000-00000000000a', true);
    insert into resultado values ('dono_religa', 'OK');
  exception when others then insert into resultado values ('dono_religa', sqlstate); end;

  perform set_config('role', 'postgres', true);
end;
$$;

select is((select valor from resultado where chave = 'dono_desliga'), 'OK',
  'o gestor da barbearia desliga o QR');

select is((select valor from resultado where chave = 'barbeiro'), '42501',
  'barbeiro nao mexe na configuracao');

select is((select valor from resultado where chave = 'estranho'), '42501',
  'dono de outra barbearia nao mexe nesta');

select is((select valor from resultado where chave = 'nulo'), '22023',
  'estado nulo e recusado');

select is((select valor from resultado where chave = 'dono_religa'), 'OK',
  'quem desligou consegue religar — o upsert nao trava na segunda vez');

-- O efeito final no que a tela lê: religado, e uma linha só.
select is(
  (select count(*)::int from recursos_do_salao
    where salon_id = :'salao' and recurso = 'agenda_publica' and ativo),
  1,
  'sobra exatamente uma linha, ligada, depois de desligar e religar'
);

select * from finish();
rollback;
