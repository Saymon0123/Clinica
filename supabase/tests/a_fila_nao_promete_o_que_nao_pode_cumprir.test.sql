-- A fila não promete o que não pode cumprir (migration 0214).
--
-- ## O que este teste existe para impedir
--
-- Em 05/10 o agente estava **ativo** com três ferramentas da fila ligadas e o
-- prompt mandando oferecer: *"quer que eu te avise se abrir?"*, com a linha
-- *"'Te aviso na hora que abrir' e verdade"*. Era falso: quem chama é o
-- `rodar_a_fila`, que só roda pelo fluxo do n8n — inativo — e o template
-- `fila_vaga_abriu` estava `ativo = false`. O cliente entraria na fila e
-- ninguém nunca ligaria.
--
-- **A asserção 1 é o coração**: com o aviso desligado, a inscrição é recusada
-- na porta. E a **2** é o par dela — recusar sem criar linha, porque uma
-- inscrição órfã no banco é a promessa feita mesmo assim.
--
-- **A asserção 3 guarda a ORDEM.** O gate vem antes de toda validação: com o
-- aviso desligado e um cliente inexistente, a resposta tem de ser "a fila está
-- desligada", e não o `42501` do cliente. Se alguém mover o gate para baixo, o
-- agente passaria a receber exceção em vez de conversa — e exceção não vira
-- frase para o cliente.
--
-- **A asserção 4 prova que é INTERRUPTOR, e não parede.** Ligando o template, a
-- mesma chamada passa, sem tocar na função. É o que faz a fila voltar sozinha
-- quando o dono religar, em vez de exigir cirurgia no n8n.
--
-- **A 5** guarda que o CRM é barrado igual. Hoje nenhuma tela chama
-- `entrar_na_fila` (o painel só lista e remove), mas se um dia chamar, a regra
-- não pode valer só para o agente: quem não pode avisar não pode prometer,
-- venha de onde vier.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(5);

\set salao  'cccc0214-0000-0000-0000-000000000001'
\set prof   'cccc0214-0001-0000-0000-000000000001'
\set serv   'cccc0214-0002-0000-0000-000000000001'
\set cli    'cccc0214-0003-0000-0000-000000000001'
\set fantasma 'cccc0214-0003-0000-0000-00000000dead'

create or replace function pg_temp.hoje() returns date
language sql as $fn$ select ((now() at time zone 'America/Sao_Paulo')::date) $fn$;

insert into salons (id, nome, ativo, folga_entre_atendimentos_minutos, horario_funcionamento)
values (:'salao', 'Barbearia da Fila Desligada', true, 0,
        jsonb_build_object('seg', jsonb_build_object('abre','08:00','fecha','20:00')));

insert into professionals (id, salon_id, nome, ativo) values (:'prof', :'salao', 'Quem Atende', true);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'serv', :'salao', 'Corte', 40, 50, true);
insert into clients (id, salon_id, nome, telefone)
values (:'cli', :'salao', 'Quem Queria Esperar', '41977770214');

-- O interruptor. `whatsapp_templates` é global (não tem `salon_id`), e a linha
-- pode ou não existir no banco de teste conforme as migrations de seed — por
-- isso o upsert, em vez de supor.
insert into whatsapp_templates (chave, nome_meta, categoria, corpo, status, ativo)
values ('fila_vaga_abriu', 'vaga_que_voce_pediu', 'utility', 'corpo de teste', 'aprovado', false)
on conflict (chave) do update set status = 'aprovado', ativo = false;

-- 1 e 2: o par que justifica a migration.
select is(
  (entrar_na_fila(:'salao', :'cli', array[:'serv'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 7, null, null, null, 'agente'))->>'ok',
  'false',
  'com o aviso DESLIGADO a inscricao e recusada na porta'
);

select is(
  (select count(*)::int from fila_de_espera where salon_id = :'salao'),
  0,
  'e recusar nao deixa inscricao orfa no banco -- linha criada seria a promessa feita mesmo assim'
);

-- 3: a ordem. Cliente inexistente normalmente levanta 42501; com o aviso
-- desligado, o gate responde ANTES disso.
select lives_ok(
  format($q$select entrar_na_fila(%L, %L, array[%L]::uuid[], %L, %L, null, null, null, 'agente')$q$,
         :'salao', :'fantasma', :'serv', pg_temp.hoje(), pg_temp.hoje() + 7),
  'o gate vem ANTES das validacoes: desligado responde conversa, nao excecao'
);

-- 4: interruptor, nao parede.
update whatsapp_templates set ativo = true where chave = 'fila_vaga_abriu';

select is(
  (entrar_na_fila(:'salao', :'cli', array[:'serv'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 7, null, null, null, 'agente'))->>'ok',
  'true',
  'ligando o template a MESMA chamada passa -- a fila volta sozinha, sem mexer na funcao'
);

-- 5: vale para o CRM tambem.
update whatsapp_templates set ativo = false where chave = 'fila_vaga_abriu';

select is(
  (entrar_na_fila(:'salao', :'cli', array[:'serv'::uuid],
                  pg_temp.hoje(), pg_temp.hoje() + 7, null, null, null, 'crm'))->>'ok',
  'false',
  'o CRM e barrado igual -- quem nao pode avisar nao pode prometer, venha de onde vier'
);

select * from finish();
rollback;
