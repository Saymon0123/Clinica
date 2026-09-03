-- Equipe sem sustos (migration 0135, passo 3.8 — achados 43 e 44).
--
-- `salvar_jornada`: validar tudo, depois apagar e gravar na mesma transação —
-- uma linha ruim nunca deixa o barbeiro sem jornada. `editar_convite`: função e
-- comissão do convite pendente, só pelo gestor, nunca de dono.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(13);

\set salao     'eeee9000-0000-0000-0000-00000000000a'
\set outro     'eeee9000-0000-0000-0000-00000000000b'
\set dono      'eeee9111-0000-0000-0000-00000000000a'
\set gerente_b 'eeee9111-0000-0000-0000-00000000000b'
\set barbeiro  'eeee9222-0000-0000-0000-00000000000a'
\set convite   'eeee9333-0000-0000-0000-00000000000a'
\set usado     'eeee9333-0000-0000-0000-00000000000b'
\set de_dono   'eeee9333-0000-0000-0000-00000000000c'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'dono', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono@teste.local', '', now(), now(), now()),
  (:'gerente_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente.b@teste.local', '', now(), now(), now());

insert into salons (id, nome) values
  (:'salao', 'Barbearia do Dono'),
  (:'outro', 'Outra Barbearia');

insert into user_salons (user_id, salon_id, role) values
  (:'dono', :'salao', 'owner'),
  (:'gerente_b', :'outro', 'gerente');

insert into professionals (id, salon_id, nome, ativo) values
  (:'barbeiro', :'salao', 'João', true);

-- Jornada antiga: 2 dias. É o que NÃO pode sumir quando a nova for recusada.
insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo) values
  (:'barbeiro', 1, '08:00', '18:00', true),
  (:'barbeiro', 2, '08:00', '18:00', true);

insert into salon_invites (id, salon_id, nome, email, role, comissao_percentual, usado_em) values
  (:'convite', :'salao', 'Novo', 'novo@teste.local', 'barbeiro', 50, null),
  (:'usado', :'salao', 'Aceito', 'aceito@teste.local', 'barbeiro', 50, now()),
  (:'de_dono', :'salao', null, 'dono2@teste.local', 'owner', null, null);

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

create or replace function pg_temp.semana(p_folga_domingo boolean) returns jsonb
language sql as $$
  select jsonb_build_array(
    jsonb_build_object('dia_semana', 0, 'ativo', not p_folga_domingo, 'hora_inicio', '09:00', 'hora_fim', '13:00'),
    jsonb_build_object('dia_semana', 1, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '19:00'),
    jsonb_build_object('dia_semana', 2, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '19:00'),
    jsonb_build_object('dia_semana', 3, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '19:00'),
    jsonb_build_object('dia_semana', 4, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '19:00'),
    jsonb_build_object('dia_semana', 5, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '20:00'),
    jsonb_build_object('dia_semana', 6, 'ativo', true, 'hora_inicio', '09:00', 'hora_fim', '18:00'))
$$;

do $$
begin
  -- Gerente de OUTRA barbearia não mexe na jornada nem no convite desta.
  perform pg_temp.entrar_como('eeee9111-0000-0000-0000-00000000000b');
  begin
    perform public.salvar_jornada('eeee9222-0000-0000-0000-00000000000a', pg_temp.semana(true));
    insert into resultado values ('jornada_outro_salao', 'PASSOU');
  exception when others then insert into resultado values ('jornada_outro_salao', sqlstate); end;
  begin
    perform public.editar_convite('eeee9333-0000-0000-0000-00000000000a', 'gerente', 40);
    insert into resultado values ('convite_outro_salao', 'PASSOU');
  exception when others then insert into resultado values ('convite_outro_salao', sqlstate); end;

  perform pg_temp.entrar_como('eeee9111-0000-0000-0000-00000000000a');   -- dono

  -- Jornada ruim (6 dias): recusada ANTES de apagar a antiga.
  begin
    perform public.salvar_jornada('eeee9222-0000-0000-0000-00000000000a', pg_temp.semana(true) - 6);
    insert into resultado values ('seis_dias', 'PASSOU');
  exception when others then insert into resultado values ('seis_dias', sqlstate); end;

  -- Saída antes da entrada num dia de trabalho.
  begin
    perform public.salvar_jornada('eeee9222-0000-0000-0000-00000000000a',
      jsonb_set(pg_temp.semana(true), '{1,hora_fim}', '"08:00"'));
    insert into resultado values ('saida_antes', 'PASSOU');
  exception when others then insert into resultado values ('saida_antes', sqlstate); end;

  insert into resultado select 'linhas_apos_recusas', count(*)::text
    from public.professional_schedules where professional_id = 'eeee9222-0000-0000-0000-00000000000a';

  -- Jornada boa: 7 dias, domingo de folga.
  perform public.salvar_jornada('eeee9222-0000-0000-0000-00000000000a', pg_temp.semana(true));

  -- Convite pendente: função e comissão mudam.
  perform public.editar_convite('eeee9333-0000-0000-0000-00000000000a', 'gerente', 40);

  begin
    perform public.editar_convite('eeee9333-0000-0000-0000-00000000000b', 'gerente', 40);
    insert into resultado values ('convite_usado', 'PASSOU');
  exception when others then insert into resultado values ('convite_usado', sqlstate); end;
  begin
    perform public.editar_convite('eeee9333-0000-0000-0000-00000000000c', 'barbeiro', 40);
    insert into resultado values ('convite_de_dono', 'PASSOU');
  exception when others then insert into resultado values ('convite_de_dono', sqlstate); end;
  begin
    perform public.editar_convite('eeee9333-0000-0000-0000-00000000000a', 'owner', 40);
    insert into resultado values ('virar_dono', 'PASSOU');
  exception when others then insert into resultado values ('virar_dono', sqlstate); end;
  begin
    perform public.editar_convite('eeee9333-0000-0000-0000-00000000000a', 'barbeiro', 150);
    insert into resultado values ('comissao_150', 'PASSOU');
  exception when others then insert into resultado values ('comissao_150', sqlstate); end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select is((select valor from resultado where chave = 'jornada_outro_salao'), '42501',
  'gerente de outra barbearia nao altera a jornada');

select is((select valor from resultado where chave = 'convite_outro_salao'), '42501',
  'gerente de outra barbearia nao edita o convite');

select is((select valor from resultado where chave = 'seis_dias'), '22023',
  'jornada com 6 dias e recusada');

select is((select valor from resultado where chave = 'saida_antes'), '22023',
  'saida antes da entrada num dia de trabalho e recusada');

select is((select valor from resultado where chave = 'linhas_apos_recusas'), '2',
  'jornada recusada NAO apaga a antiga: as 2 linhas continuam la');

select is(
  (select count(*)::int from professional_schedules where professional_id = :'barbeiro'),
  7,
  'jornada boa grava os 7 dias'
);

select is(
  (select ativo from professional_schedules where professional_id = :'barbeiro' and dia_semana = 0),
  false,
  'domingo de folga fica gravado com ativo = false, nao some'
);

select is(
  (select hora_inicio::text || '-' || hora_fim::text from professional_schedules where professional_id = :'barbeiro' and dia_semana = 5),
  '09:00:00-20:00:00',
  'a jornada nova substituiu a antiga (sexta 09-20)'
);

select is(
  (select role || '/' || comissao_percentual::text from salon_invites where id = :'convite'),
  'gerente/40.00',
  'convite pendente: funcao e comissao mudaram'
);

select is((select valor from resultado where chave = 'convite_usado'), '22023',
  'convite ja aceito nao se edita');

select is((select valor from resultado where chave = 'convite_de_dono'), '42501',
  'convite de dono nao se edita por aqui');

select is((select valor from resultado where chave = 'virar_dono'), '22023',
  'ninguem vira dono por aqui');

select is((select valor from resultado where chave = 'comissao_150'), '22023',
  'comissao fora de 0-100 e recusada');

select * from finish();
rollback;
