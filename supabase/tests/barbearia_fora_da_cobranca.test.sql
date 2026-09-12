-- Barbearia fora da cobrança (migration 0160).
--
-- A barbearia de teste do dono mora no banco de produção. Sem esta trava, o
-- fechamento do dia 1º geraria fatura para ela — e, com o AbacatePay em
-- produção, PIX de verdade cobrando o dono dele mesmo.
--
-- O que este teste protege não é a conta: é o padrão. `cobravel` nasce
-- **verdadeiro**, e é isso que impede que a próxima barbearia entre de graça
-- por esquecimento.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(6);

\set salao_cobra 'cccc9000-0000-0000-0000-000000000001'
\set salao_fora  'cccc9000-0000-0000-0000-000000000002'

insert into salons (id, nome) values
  (:'salao_cobra', 'Cliente de Verdade'),
  (:'salao_fora',  'Barbearia Interna');

-- Teste grátis terminado bem antes do período faturado: sem isto o recorte do
-- teste (0130) engoliria o período e as duas barbearias devolveriam null — o
-- teste passaria verde sem provar nada.
insert into subscriptions (salon_id, status, acesso_ate, trial_ate) values
  (:'salao_cobra', 'ativa', current_date + 30, date '2026-01-01'),
  (:'salao_fora',  'ativa', current_date + 30, date '2026-01-01');

-- ---------------------------------------------------------------------------
-- O padrão é cobrar
-- ---------------------------------------------------------------------------

select is(
  (select cobravel from salons where id = :'salao_cobra'),
  true,
  'barbearia nasce cobravel: ninguem entra de graca por esquecimento'
);

select isnt(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_cobra', date '2026-06-01', date '2026-06-30', 'mensal')),
  null::date,
  'barbearia cobravel continua gerando fatura normalmente'
);

-- ---------------------------------------------------------------------------
-- E a exceção é explícita
-- ---------------------------------------------------------------------------

update salons set cobravel = false where id = :'salao_fora';

select is(
  (select periodo_inicio from gerar_fatura_de_uso(:'salao_fora', date '2026-06-01', date '2026-06-30', 'mensal')),
  null::date,
  'barbearia fora da cobranca nao gera fatura'
);

-- `gerar_fatura_de_uso` devolve um COMPOSTO: chamada em FROM ela sempre rende
-- uma linha, com as colunas nulas quando não há fatura. Por isso a asserção
-- acima olha o campo; esta olha a tabela, que é onde o estrago moraria.
select is(
  (select count(*)::int from faturas_de_uso where salon_id = :'salao_fora'),
  0,
  'e nao deixa nem uma fatura de R$ 0,00 para tras'
);

-- A fatura de cancelamento passa pela mesma porta. Se a trava tivesse sido
-- escrita no fechamento mensal em vez de dentro de `gerar_fatura_de_uso`,
-- cancelar a barbearia interna ainda cobraria.
select is(
  (select periodo_inicio from gerar_fatura_de_cancelamento(:'salao_fora')),
  null::date,
  'nem pela porta do cancelamento'
);

-- ---------------------------------------------------------------------------
-- E a tela sabe, senão ela promete uma cobrança que nunca chega
-- ---------------------------------------------------------------------------

select is(
  (select cobravel from uso_do_sistema_no_mes where salon_id = :'salao_fora'),
  false,
  'o medidor da tela carrega a informacao, para nao prometer cobranca'
);

select * from finish();
rollback;
