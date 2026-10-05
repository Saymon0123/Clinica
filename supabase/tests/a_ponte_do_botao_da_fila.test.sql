-- A ponte do botão da fila (migration 0209).
--
-- ## O que este teste existe para impedir
--
-- **A asserção 7 é o coração, e ela guarda um laço que custa dinheiro.** Quando
-- o cliente aperta "Esse nao serve", a vaga é devolvida e ele continua
-- esperando. Só isso criaria um laço: a `chamar_proximos_da_fila` seleciona
-- `status = 'esperando'` sem carência nenhuma, então a varredura seguinte
-- ofereceria o MESMO horário -- e cada oferta é um template pago. A regra que a
-- 0209 trouxe é "nunca oferecer o mesmo início duas vezes à mesma inscrição",
-- e é isto que a asserção mede: depois de recusar as 09:00, a próxima chamada
-- vem com OUTRO horário.
--
-- **A asserção 5 guarda o contador.** `chamadas` existe para chamada PERDIDA
-- ("a pessoa podia estar no banho") e duas delas ENCERRAM a inscrição. Subir o
-- contador em quem respondeu encerraria a espera de quem está participando --
-- o mesmo dano de ligar a varredura sem o aviso existir.
--
-- **As asserções 3 e 11 guardam o encadeamento da edge.** `atendido = false`
-- significa "não é minha, siga tentando": é o que deixa o opt-out de LGPD
-- continuar funcionando depois da ponte. Se a ponte passasse a responder
-- `true` para qualquer botão, "Nao quero mais receber" pararia de ser gravado --
-- e isso é LGPD, não UX.
--
-- E a **asserção 2** amarra o wamid ao horário oferecido: é esse par que faz a
-- ponte funcionar com N barbearias saindo do mesmo número central, onde o
-- telefone não desempata (a mesma pessoa pode ser cliente de duas).
--
-- A fixture é a mesma forma de `a_fila_que_chama.test.sql`: jornada nos sete
-- dias e barbearia aberta todos os dias, porque supor "amanhã tem vaga" caiu num
-- domingo fechado.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(20);

\set salao 'aaaa2600-0000-0000-0000-000000000001'
\set prof  'aaaa2601-0000-0000-0000-000000000001'
\set corte 'aaaa2602-0000-0000-0000-000000000001'
\set c1    'aaaa2603-0000-0000-0000-000000000001'
\set c2    'aaaa2603-0000-0000-0000-000000000002'
\set c3    'aaaa2603-0000-0000-0000-000000000003'
\set c4    'aaaa2603-0000-0000-0000-000000000004'

create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia da Ponte', true, 0,
        jsonb_build_object(
          'dom', jsonb_build_object('abre','08:00','fecha','20:00'),
          'seg', jsonb_build_object('abre','08:00','fecha','20:00'),
          'ter', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qua', jsonb_build_object('abre','08:00','fecha','20:00'),
          'qui', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sex', jsonb_build_object('abre','08:00','fecha','20:00'),
          'sab', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo)
values (:'prof', :'salao', 'Quem Atende', true);

insert into professional_schedules (professional_id, dia_semana, hora_inicio, hora_fim, ativo)
select :'prof', d, '08:00', '20:00', true from generate_series(0, 6) d;

insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'corte', :'salao', 'Corte', 30, 50, true);

insert into professional_services (professional_id, service_id)
values (:'prof', :'corte');

insert into clients (id, salon_id, nome, telefone) values
  (:'c1', :'salao', 'Quem Espera',       '41977770061'),
  (:'c2', :'salao', 'Quem Espera Dois',  '41977770062'),
  (:'c3', :'salao', 'Quem Espera Tres',  '41977770063'),
  -- SEM telefone: o CHECK clients_telefone_valido e
  -- `telefone IS NULL OR telefone_valido(...)`, entao nulo passa de proposito.
  -- E este o caso alcancavel; telefone com lixo e recusado na porta.
  (:'c4', :'salao', 'Quem Nao Tem Numero', null);

-- A fila so aceita gente com o aviso de vaga LIGADO (migration 0214): quem nao
-- pode avisar nao pode prometer. Este teste exercita a fila FUNCIONANDO, entao o
-- interruptor faz parte da fixture -- e `whatsapp_templates` e global, sem
-- `salon_id`, por isso o upsert em vez de supor que a linha existe no banco de
-- teste.
insert into whatsapp_templates (chave, nome_meta, categoria, corpo, status, ativo)
values ('fila_vaga_abriu', 'vaga_que_voce_pediu', 'utility', 'corpo de teste', 'aprovado', true)
on conflict (chave) do update set status = 'aprovado', ativo = true;

------------- 1. sem vaga segurada nao ha o que avisar

select ok(
  (entrar_na_fila(:'salao', :'c1', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'entra na fila esperando corte'
);

-- Nota: a inscricao acima acabou de nascer `esperando`, sem reserva. Avisar
-- alguem que nao foi chamado nao faz sentido, e a funcao recusa com motivo em
-- vez de gravar um wamid orfao que depois resolveria para lugar nenhum.
select is(
  (registrar_aviso_da_fila(
     (select id from fila_de_espera where client_id = :'c1'),
     'wamid_cedo_demais')->>'motivo'),
  'Essa inscricao nao tem vaga segurada para avisar.',
  'inscricao sem vaga segurada nao aceita aviso'
);

------------- 2. o wamid guarda o horario OFERECIDO

create temp table primeira_chamada as
  select * from private.chamar_proximos_da_fila(10);

create temp table primeiro_aviso as
  select registrar_aviso_da_fila(
           (select id from fila_de_espera where client_id = :'c1'),
           'wamid_um') as r;

select is(
  (select fa.inicio from fila_avisos fa where fa.message_id = 'wamid_um'),
  (select a.data_hora_inicio
     from appointments a
     join fila_de_espera f on f.appointment_id = a.id
    where f.client_id = :'c1'),
  'o aviso guarda o inicio da reserva que foi oferecida -- e o wamid e quem desempata entre barbearias'
);

------------- 3. wamid desconhecido devolve atendido=false

select ok(
  not (responder_vaga_da_fila('wamid_que_nunca_existiu', 'Sim')->>'atendido')::boolean,
  'wamid desconhecido devolve atendido=false, para a edge seguir tentando o opt-out'
);

------------- 4 a 6. "Esse nao serve": devolve a vaga, continua esperando, sem queimar ficha

create temp table reserva_recusada as
  select appointment_id as id,
         (select a.data_hora_inicio from appointments a where a.id = f.appointment_id) as inicio
    from fila_de_espera f where f.client_id = :'c1';

-- A chamada numa instrucao SO: `and` em SQL nao garante ordem de avaliacao, e
-- misturar a chamada com a consequencia ja reprovou no CI duas vezes aqui.
create temp table recusa as
  select responder_vaga_da_fila('wamid_um', 'Esse nao serve') as r;

select is(
  (select (r->>'acao') from recusa),
  'fila_recusou',
  '"Esse nao serve" e entendido como recusa daquela vaga'
);

select is(
  (select status || '/' || chamadas from fila_de_espera where client_id = :'c1'),
  'esperando/0',
  'quem recusou volta a esperar e NAO queima ficha: `chamadas` e contador de chamada PERDIDA, e duas encerram a inscricao'
);

select is(
  (select count(*)::int from appointments where id = (select id from reserva_recusada)),
  0,
  'a vaga recusada e devolvida NA HORA, nao na varredura: ela pode ser a da proxima pessoa da fila'
);

------------- 7. A TRAVA DO LACO: o mesmo horario nao volta

create temp table segunda_chamada as
  select * from private.chamar_proximos_da_fila(10);

-- `isnt` sozinho passaria tambem com NENHUMA vaga oferecida (NULL difere de
-- tudo), e isso seria passar pelo motivo errado. O case distingue os tres
-- destinos possiveis e so um deles e aceito.
select is(
  (select case
            when f.appointment_id is null then 'nenhuma vaga nova'
            when a.data_hora_inicio = (select inicio from reserva_recusada)
              then 'REPETIU O RECUSADO'
            else 'vaga nova, diferente'
          end
     from fila_de_espera f
     left join appointments a on a.id = f.appointment_id
    where f.client_id = :'c1'),
  'vaga nova, diferente',
  'a varredura seguinte NAO oferece o horario que a pessoa acabou de recusar, e oferece OUTRO -- sem isto, cada volta do laco e um template pago'
);

------------- 8 e 9. "Sim" confirma, e o segundo clique nao refaz

create temp table segundo_aviso as
  select registrar_aviso_da_fila(
           (select id from fila_de_espera where client_id = :'c1'),
           'wamid_dois') as r;

create temp table confirmacao as
  select responder_vaga_da_fila('wamid_dois', 'Sim') as r;

select is(
  (select (r->>'acao') from confirmacao) || '/'
  || (select status from fila_de_espera where client_id = :'c1') || '/'
  || (select a.status from appointments a
       where a.id = ((select r from confirmacao)->>'appointment_id')::uuid),
  'fila_confirmado/atendido/agendado',
  '"Sim" vira agendamento de verdade: a inscricao fica atendida e a reserva deixa de ser reserva'
);

create temp table clique_repetido as
  select responder_vaga_da_fila('wamid_dois', 'Sim') as r;

select is(
  (select (r->>'acao') from clique_repetido),
  'repetido',
  'o segundo clique no MESMO aviso nao refaz nada e nao conta outra historia sobre o mesmo horario'
);

------------- 10. "Sair da espera" encerra

select ok(
  (entrar_na_fila(:'salao', :'c2', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'segunda pessoa entra na fila (o indice unico permite uma viva por cliente)'
);

create temp table terceira_chamada as
  select * from private.chamar_proximos_da_fila(10);

create temp table terceiro_aviso as
  select registrar_aviso_da_fila(
           (select id from fila_de_espera where client_id = :'c2'),
           'wamid_tres') as r;

create temp table saida as
  select responder_vaga_da_fila('wamid_tres', 'Sair da espera') as r;

select is(
  (select (r->>'acao') from saida) || '/'
  || (select status from fila_de_espera where client_id = :'c2'),
  'fila_saiu/saiu',
  '"Sair da espera" encerra a inscricao -- e nao se confunde com o opt-out de LGPD, que compara a mensagem INTEIRA'
);

------------- 11. botao estranho nao e engolido pela ponte

-- Precisa de uma inscricao CHAMADA e um aviso que EXISTA: com `c1` (ja atendido)
-- o registro seria recusado, o wamid nao existiria, e a assercao passaria por
-- falta de linha em vez de pela regua do botao -- passar pelo motivo errado e
-- nao testar nada.
select ok(
  (entrar_na_fila(:'salao', :'c3', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'terceira pessoa entra na fila, para o aviso do botao estranho existir de verdade'
);

create temp table quarta_chamada as
  select * from private.chamar_proximos_da_fila(10);

create temp table quarto_aviso as
  select registrar_aviso_da_fila(
           (select id from fila_de_espera where client_id = :'c3'),
           'wamid_quatro') as r;

select ok(
  (select (r->>'ok')::boolean from quarto_aviso),
  'o aviso do botao estranho foi registrado (senao a assercao seguinte nao prova nada)'
);

select ok(
  not (responder_vaga_da_fila('wamid_quatro', 'Nao quero mais receber')->>'atendido')::boolean,
  'botao que nao e nenhum dos tres devolve atendido=false, mesmo com o wamid existindo: e assim que "Nao quero mais receber" continua chegando ao opt-out'
);

------------- 12 e 13. o trinco

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'fila_avisos'
      and grantee in ('anon', 'authenticated')),
  0,
  'fila_avisos nao tem grant para anon nem authenticated -- tabela nova NASCE com eles pelo padrao do schema'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('registrar_aviso_da_fila', 'responder_vaga_da_fila'))
           or (n.nspname = 'private' and p.proname = 'chamar_proximos_da_fila'))
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'nenhuma das tres funcoes e executavel por anon ou authenticated: quem chama e a edge, com service_role'
);

------------- 18 a 20. a regua do destino (migration 0210)

-- O fluxo NAO monta numero: `private.destino_whatsapp` poe o 55 em telefone de
-- balcao (11 digitos) e deixa quem ja tem DDI em paz. Duas copias dessa regra e
-- como elas divergem, e o comentario da propria funcao diz qual e o defeito:
-- "somar outro 55 aqui".
select is(
  (select destino from primeira_chamada limit 1),
  '5541977770061',
  'a varredura devolve o destino PRONTO pela regua da casa: telefone de balcao ganha o 55'
);

select ok(
  (entrar_na_fila(:'salao', :'c4', array[:'corte'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 6)->>'ok')::boolean,
  'quem nao tem telefone entra na fila: o dono ainda pode ligar a mao'
);

create temp table varredura_sem_destino as
  select * from private.chamar_proximos_da_fila(10);

-- Se ela FOSSE chamada, a reserva prenderia um horario 30 minutos para quem
-- nunca receberia o aviso, e duas varreduras depois a inscricao se encerraria em
-- silencio -- tirando da fila quem nunca soube.
select is(
  (select status || '/' || chamadas from fila_de_espera where client_id = :'c4'),
  'esperando/0',
  'quem nao tem destino montavel NAO e chamado: fica esperando, sem reserva e sem queimar ficha'
);

select * from finish();
rollback;
