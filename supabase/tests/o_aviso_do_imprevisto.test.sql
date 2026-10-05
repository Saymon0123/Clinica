-- O aviso do imprevisto (migration 0215).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 2 é o coração.** O aviso é escalonado: um de cada vez, para o
-- primeiro escolher antes de o segundo ser avisado. Sem isso, dez pessoas
-- recebem o aviso juntas e disputam as mesmas vagas — e nove descobrem que a
-- vaga que o aviso prometia já era. A asserção mede a varredura rodando DUAS
-- vezes seguidas e exigindo zero na segunda.
--
-- **A 1 guarda a ordem** (decisão do dono: do mais cedo para o mais tarde) e
-- faz isso com os agendamentos INSERIDOS fora de ordem, senão passaria por
-- acidente.
--
-- **A 5 é a que protege a promessa.** A regra do dono é "um aviso só, e quem não
-- remarca perde o horário" — o que só é justo para quem FOI avisado. Quem nunca
-- recebeu aviso não pode ser cancelado, nem quando o prazo dos outros vence.
-- Essa assimetria é fácil de perder num refactor, e o cliente só descobriria
-- chegando à barbearia fechada.
--
-- **A 6 e a 7 são o par da devolução.** A reivindicação é gravada ANTES do
-- envio, para duas varreduras não avisarem a mesma pessoa; o preço disso é que
-- uma falha de envio consumiria o aviso único de quem nunca o recebeu. A 6 prova
-- que devolver libera. A 7 prova que devolver NÃO apaga quando o WAMID já está
-- gravado — senão uma devolução atrasada faria a pessoa ser avisada duas vezes.
--
-- A fixture usa o relógio de São Paulo (`now() at time zone`), nunca
-- `current_date`: o runner do CI vive em UTC.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

\set salao 'dddd0215-0000-0000-0000-000000000001'
\set prof  'dddd0215-0001-0000-0000-000000000001'
\set serv  'dddd0215-0002-0000-0000-000000000001'
\set c1    'dddd0215-0003-0000-0000-000000000001'
\set c2    'dddd0215-0003-0000-0000-000000000002'
\set c3    'dddd0215-0003-0000-0000-000000000003'

create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

-- Tres dias a frente: janela larga o bastante para o modo ESCALONADO valer (o
-- prazo por pessoa bate no teto de 3h, bem acima do piso de 30 min).
create or replace function pg_temp.dia() returns date
language sql as $fn$ select pg_temp.hoje() + 3 $fn$;

create or replace function pg_temp.em(h text) returns timestamptz
language sql as $fn$
  select (pg_temp.dia()::text || ' ' || h)::timestamp at time zone 'America/Sao_Paulo'
$fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia do Imprevisto', true, 0,
        jsonb_build_object('seg', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo)
values (:'prof', :'salao', 'Barbeiro Solo', true);

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'serv', :'salao', 'Corte', 40, 50, true);

insert into clients (id, salon_id, nome, telefone) values
  (:'c1', :'salao', 'Das Duas da Tarde', '41977770301'),
  (:'c2', :'salao', 'Das Nove da Manha', '41977770302'),
  (:'c3', :'salao', 'Das Onze',          '41977770303');

-- FORA DE ORDEM de proposito: 14:00 entra primeiro. Se a varredura devolvesse
-- "o primeiro inserido", a assercao 1 passaria por acidente.
insert into appointments (salon_id, client_id, professional_id, service_id,
                          data_hora_inicio, status, origem) values
  (:'salao', :'c1', :'prof', :'serv', pg_temp.em('14:00'), 'agendado', 'crm'),
  (:'salao', :'c2', :'prof', :'serv', pg_temp.em('09:00'), 'agendado', 'crm'),
  (:'salao', :'c3', :'prof', :'serv', pg_temp.em('11:00'), 'agendado', 'crm');

insert into dias_de_folga (professional_id, dia, motivo)
values (:'prof', pg_temp.dia(), 'Imprevisto');

-- 1: um so, e o MAIS CEDO.
select is(
  (select x.hora_local from private.proximos_avisos_do_imprevisto(10, 3) x),
  '09:00',
  'a primeira varredura avisa UMA pessoa, a do horario mais cedo'
);

-- 2: o coracao. Rodando de novo na sequencia, ninguem anda.
select is(
  (select count(*)::int from private.proximos_avisos_do_imprevisto(10, 3) x),
  0,
  'a varredura seguinte nao avisa ninguem -- o prazo do primeiro esta correndo'
);

-- 3: o primeiro resolve (cancelou pela pagina de gestao), o proximo anda.
update appointments set status = 'cancelado', cancelado_por = 'cliente'
 where professional_id = :'prof' and data_hora_inicio = pg_temp.em('09:00');

select is(
  (select x.hora_local from private.proximos_avisos_do_imprevisto(10, 3) x),
  '11:00',
  'resolvido o primeiro, o proximo mais cedo e avisado'
);

-- 4 e 5: o vencimento esvazia o dia -- mas so para quem FOI avisado.
update avisos_do_imprevisto set prazo = now() - interval '1 minute';

select is(
  private.cancelar_vencidos_do_imprevisto(),
  1,
  'no vencimento, quem foi avisado e nao resolveu e cancelado'
);

select is(
  (select status from appointments
    where professional_id = :'prof' and data_hora_inicio = pg_temp.em('14:00')),
  'agendado',
  'quem NUNCA foi avisado NAO e cancelado -- a regra do aviso unico so e justa com quem o recebeu'
);

-- 6 e 7: a devolucao, quando o envio falha.
delete from avisos_do_imprevisto;
update appointments set status = 'agendado', cancelado_por = null
 where professional_id = :'prof' and data_hora_inicio = pg_temp.em('11:00');

select is(
  (select x.hora_local from private.proximos_avisos_do_imprevisto(10, 3) x),
  '11:00',
  'com a folha limpa, a varredura volta a avisar o mais cedo de pe'
);

-- O efeito fica FORA da assercao, num bloco proprio.
--
-- A primeira versao deste teste chamava `devolver_aviso_do_imprevisto(...)` e
-- conferia o resultado dentro do mesmo `ok(A and B)` -- e reprovou. O Postgres
-- nao garante que `A` seja avaliado antes de `B` num `and`: a conferencia podia
-- rodar antes da chamada. Efeito colateral dentro de expressao booleana e
-- armadilha, e o teste so acusou porque mediu de verdade.
do $$
begin
  perform devolver_aviso_do_imprevisto(
    (select appointment_id from avisos_do_imprevisto limit 1));
end $$;

select is(
  (select count(*)::int from avisos_do_imprevisto),
  0,
  'devolver libera a reivindicacao -- falha de envio nao consome o aviso unico de ninguem'
);

do $$
declare v_id uuid;
begin
  select x.appointment_id into v_id from private.proximos_avisos_do_imprevisto(10, 3) x;
  perform registrar_aviso_do_imprevisto(v_id, 'wamid.TESTE');
  -- Devolucao ATRASADA, depois de a mensagem ja ter saido.
  perform devolver_aviso_do_imprevisto(v_id);
end $$;

select is(
  (select message_id from avisos_do_imprevisto),
  'wamid.TESTE',
  'devolver NAO apaga depois do WAMID gravado -- a mensagem saiu, e apagar faria avisar duas vezes'
);

-- 9: o trinco.
select ok(
  not has_table_privilege('anon', 'public.avisos_do_imprevisto', 'select')
  and not has_table_privilege('authenticated', 'public.avisos_do_imprevisto', 'select'),
  'ninguem le a tabela pelo REST -- so o service_role e as funcoes definer'
);

select * from finish();
rollback;
