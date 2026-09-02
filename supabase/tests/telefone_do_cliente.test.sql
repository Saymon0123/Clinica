-- A régua do telefone do cliente (migration 0128, passo 1.9 do roteiro).
--
-- Um cliente com telefone que não é telefone não é um detalhe cosmético: a
-- coluna gerada `telefone_norm` são os últimos 8 dígitos, e texto sem dígito
-- vira NULO — o cliente existe na lista, escapa do índice único e some de
-- todo casamento com o WhatsApp (lembrete, reativação, avaliação). Curto é
-- pior: '9999' casa por sufixo com qualquer número terminado assim, e a
-- resposta de um cliente cai no cadastro de outro.
--
-- A asserção mais importante deste arquivo é a da constraint VALIDADA. Uma
-- CHECK `NOT VALID` pareceria correta em todos os testes de INSERT abaixo e
-- ainda assim quebraria em produção: ela também vale para UPDATE de linha
-- preexistente, e o fechamento de comanda grava preferência de aviso na
-- `clients` a cada venda, engolindo o erro num `console.error`. O opt-in de
-- retorno deixaria de gravar sem ninguém ver.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(11);

\set salao 'eeee0000-0000-0000-0000-000000000001'

insert into salons (id, nome) values (:'salao', 'Barbearia do Teste');

-- ---------------------------------------------------------------------------
-- A faixa: 10 a 13 dígitos, ignorando máscara
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Fixo com DDD', '4133445566')$$,
  'aceita 10 digitos (fixo com DDD)'
);

select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Celular', '41988112233')$$,
  'aceita 11 digitos (celular com DDD)'
);

select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Antigo com DDI', '554133447788')$$,
  'aceita 12 digitos (DDI + numero antigo de 8)'
);

select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Como vem do WhatsApp', '5541988117799')$$,
  'aceita 13 digitos (DDI + celular) -- e o formato que o agente grava'
);

-- Máscara é como o balcão digita. A régua conta dígitos, não caracteres.
select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Digitado com mascara', '(41) 98811-4455')$$,
  'aceita telefone com mascara'
);

-- Cliente sem WhatsApp existe e continua entrando.
select lives_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Sem telefone', null)$$,
  'aceita telefone em branco'
);

select throws_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Sem DDD', '987275895')$$,
  '23514',
  null,
  'recusa 9 digitos (celular sem DDD)'
);

select throws_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'DDI dobrado', '55554187275895')$$,
  '23514',
  null,
  'recusa 14 digitos (o 55 colado duas vezes)'
);

-- O lixo real da base era exatamente isto: teclado batido no lugar do número.
select throws_ok(
  $$insert into clients (salon_id, nome, telefone) values ('eeee0000-0000-0000-0000-000000000001', 'Teclado batido', 'lkasdnfoabi')$$,
  '23514',
  null,
  'recusa texto sem digito nenhum'
);

-- ---------------------------------------------------------------------------
-- O que a régua compra, e o que ela só compra se estiver validada
-- ---------------------------------------------------------------------------

-- Este é o invariante que interessa para a automação: telefone preenchido
-- passa a garantir telefone_norm preenchido. Antes da 0128, seis clientes
-- tinham telefone e norm nulo — invisíveis para todo disparo.
select is(
  (select count(*) from clients where telefone is not null and telefone_norm is null)::int,
  0,
  'telefone preenchido garante telefone_norm preenchido'
);

-- `NOT VALID` passaria em tudo acima e ainda assim deixaria a porta aberta
-- para linha antiga. Esta asserção é a que separa uma coisa da outra.
select is(
  (select convalidated from pg_constraint where conname = 'clients_telefone_valido'),
  true,
  'a constraint esta VALIDADA, nao NOT VALID'
);

select * from finish();
rollback;
