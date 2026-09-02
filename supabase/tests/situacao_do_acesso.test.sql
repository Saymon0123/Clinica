-- A situação do acesso para toda a equipe (migration 0131, passo 2.2 — achados 16 e 20).
--
-- O defeito: a policy de `subscriptions` é só do dono. Barbeiro e gerente
-- recebiam nada, o layout lia "nada" como "barbearia antiga sem controle" e a
-- equipe inteira seguia usando o CRM de uma unidade vencida — enquanto o dono
-- estava trancado do lado de fora.
--
-- O conserto NÃO abriu a policy, porque a mesma linha guarda o CPF do pagador.
-- Abriu uma RPC que devolve só a situação. A segunda asserção é a que sustenta
-- essa escolha: o barbeiro tem de ver a situação E continuar sem ver a linha.
--
-- Toda chamada à RPC aqui acontece SOB UMA IDENTIDADE. Ela é definer e se
-- autoriza por `private.salon_ids()`, que lê `auth.uid()`: chamada como
-- superusuário do teste, sem JWT, devolve linha nenhuma — e uma asserção que
-- compara com nulo passa ou falha por acidente. Foi exatamente assim que a
-- primeira versão deste arquivo estava errada.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(10);

\set salao_a     'bbbb9000-0000-0000-0000-00000000000a'
\set salao_b     'bbbb9000-0000-0000-0000-00000000000b'
\set salao_livre 'bbbb9000-0000-0000-0000-00000000000c'
\set dono_a      'bbbb9111-0000-0000-0000-00000000000a'
\set barb_a      'bbbb9111-0000-0000-0000-00000000000c'
\set dono_b      'bbbb9111-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.a@teste.local', '', now(), now(), now()),
  (:'barb_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barb.a@teste.local', '', now(), now(), now()),
  (:'dono_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.b@teste.local', '', now(), now(), now());

insert into salons (id, nome) values
  (:'salao_a', 'Barbearia A'), (:'salao_b', 'Barbearia B'), (:'salao_livre', 'Barbearia Sem Vencimento');

-- dono_a é dono das três (uma rede): é a única identidade que enxerga as três
-- ao mesmo tempo, o que o invariante do fim precisa. dono_b só tem a B.
insert into user_salons (user_id, salon_id, role) values
  (:'dono_a', :'salao_a', 'owner'),
  (:'dono_a', :'salao_b', 'owner'),
  (:'dono_a', :'salao_livre', 'owner'),
  (:'barb_a', :'salao_a', 'barbeiro'),
  (:'dono_b', :'salao_b', 'owner');

-- Datas a 10 dias de hoje, de propósito: a RPC usa a data de São Paulo e as
-- views usam `current_date` (UTC). Perto da meia-noite as duas divergem por
-- algumas horas; a 10 dias, nunca.
insert into subscriptions (salon_id, status, acesso_ate, atendimento_ate) values
  (:'salao_a', 'ativa', current_date + 10, null),
  (:'salao_b', 'ativa', current_date + 10, null),
  (:'salao_livre', 'ativa', null, null);

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

create or replace function pg_temp.sair() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem vê o quê
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000c');   -- barbeiro da A
  insert into resultado select 'barb_rpc', count(*)::text from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000a');
  insert into resultado select 'barb_tabela', count(*)::text from public.subscriptions where salon_id = 'bbbb9000-0000-0000-0000-00000000000a';
  select * into r from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000a');
  insert into resultado values ('barb_regua_nula', r.atendimento_ate::text);
  insert into resultado values ('barb_hoje', r.bloqueado::text || '/' || r.atendendo::text);

  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000a');   -- dono da rede
  insert into resultado select 'dono_tabela', count(*)::text from public.subscriptions where salon_id = 'bbbb9000-0000-0000-0000-00000000000a';
  select * into r from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000c');
  insert into resultado values ('sem_vencimento', r.bloqueado::text || '/' || r.atendendo::text);

  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000b');   -- dono só da B, tentando a A
  insert into resultado select 'estranho_rpc', count(*)::text from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000a');

  perform pg_temp.sair();
end $$;

select is((select valor from resultado where chave = 'barb_rpc'), '1',
  'barbeiro enxerga a situacao do acesso da unidade');

select is((select valor from resultado where chave = 'barb_tabela'), '0',
  'e continua sem enxergar a linha da tabela -- o CPF do dono nao vaza');

select is((select valor from resultado where chave = 'dono_tabela'), '1',
  'o dono continua lendo a linha inteira');

select is((select valor from resultado where chave = 'estranho_rpc'), '0',
  'quem nao tem vinculo com a unidade recebe linha nenhuma');

select is((select valor from resultado where chave = 'barb_regua_nula'), (current_date + 13)::text,
  'sem atendimento_ate, a regua e acesso_ate + 3 -- a mesma das views');

select is((select valor from resultado where chave = 'barb_hoje'), 'false/true',
  'acesso no prazo: nao bloqueado, atendendo');

select is((select valor from resultado where chave = 'sem_vencimento'), 'false/true',
  'sem vencimento automatico (acesso_ate nulo) nunca bloqueia nem para de atender');

-- ---------------------------------------------------------------------------
-- O que a tela diz quando venceu — e se diz o mesmo que a view
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  -- A vence há 10 dias: bloqueado, e o WhatsApp parou há 7.
  update public.subscriptions set acesso_ate = current_date - 10
   where salon_id = 'bbbb9000-0000-0000-0000-00000000000a';
  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000a');
  select * into r from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000a');
  insert into resultado values ('vencido', r.bloqueado::text || '/' || r.atendendo::text);
  perform pg_temp.sair();

  -- Com a coluna preenchida, ela manda — mesmo com o acesso vencido.
  update public.subscriptions set atendimento_ate = current_date + 5
   where salon_id = 'bbbb9000-0000-0000-0000-00000000000a';
  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000a');
  select * into r from public.situacao_do_acesso('bbbb9000-0000-0000-0000-00000000000a');
  insert into resultado values ('preenchido', r.atendimento_ate::text || ' ' || r.atendendo::text);
  perform pg_temp.sair();

  -- B vence de vez (sem coluna): as três unidades em três estados diferentes.
  update public.subscriptions set acesso_ate = current_date - 10, atendimento_ate = null
   where salon_id = 'bbbb9000-0000-0000-0000-00000000000b';
  perform pg_temp.entrar_como('bbbb9111-0000-0000-0000-00000000000a');
  -- O invariante que fecha o achado 20: a tela e a view cortam pela MESMA regra.
  -- Se `atendendo` for verdadeiro, a unidade está em salons_com_automacao, e
  -- vice-versa — para as três, em qualquer estado.
  insert into resultado
  select 'discordam', count(*)::text
    from public.subscriptions sub
   where sub.salon_id in ('bbbb9000-0000-0000-0000-00000000000a',
                          'bbbb9000-0000-0000-0000-00000000000b',
                          'bbbb9000-0000-0000-0000-00000000000c')
     and (select atendendo from public.situacao_do_acesso(sub.salon_id))
         is distinct from exists (select 1 from public.salons_com_automacao v where v.id = sub.salon_id);
  perform pg_temp.sair();
end $$;

select is((select valor from resultado where chave = 'vencido'), 'true/false',
  'vencido ha 10 dias: bloqueado, e o WhatsApp tambem parou');

select is((select valor from resultado where chave = 'preenchido'), (current_date + 5)::text || ' true',
  'atendimento_ate preenchido vence a regua dos 3 dias');

select is((select valor from resultado where chave = 'discordam'), '0',
  'a RPC e salons_com_automacao concordam sobre quem ainda esta sendo atendido');

select * from finish();
rollback;
