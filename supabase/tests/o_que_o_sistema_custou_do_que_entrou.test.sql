-- O faturamento no medidor de uso (migration 0190).
--
-- A tela de Uso e cobrança diz "o sistema custou X% do que entrou". Os dois
-- números dessa frase têm de vir da MESMA janela, senão o percentual mente sem
-- nada acusar — e mentir sobre o próprio preço é o pior lugar para errar.
--
-- O que este teste guarda é a JANELA, não a soma. A soma é um `sum()`; a janela
-- é `date_trunc('month')` no relógio de São Paulo, e foi ela que quase passou
-- batido: no ensaio desta migration o faturamento veio ZERO porque em São Paulo
-- já era dia 1º às 00h49, enquanto a máquina de quem escrevia ainda marcava o
-- dia 30. O assert que exigia número maior que zero foi o que avisou.
--
-- Por isso toda fixture aqui usa o relógio de São Paulo, nunca `current_date`:
-- o runner do CI vive em UTC, e a comanda "de hoje" viraria "de ontem" de
-- madrugada.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(7);

\set salao  'dddd1900-0000-0000-0000-000000000001'
\set vizinho 'dddd1900-0000-0000-0000-000000000002'
\set hoje_paga    'dddd1901-0000-0000-0000-000000000001'
\set mes_passado  'dddd1901-0000-0000-0000-000000000002'
\set ainda_aberta 'dddd1901-0000-0000-0000-000000000003'
\set sem_pagamento 'dddd1901-0000-0000-0000-000000000004'
\set do_vizinho   'dddd1901-0000-0000-0000-000000000005'

insert into salons (id, nome) values
  (:'salao',   'Barbearia do Medidor'),
  (:'vizinho', 'Barbearia da Esquina');

-- `now()` cai sempre dentro da janela: a janela É "dia 1 do mês até hoje" no
-- relógio de São Paulo, e `now()` é hoje por definição, em qualquer fuso.
insert into orders (id, salon_id, status, closed_at) values
  (:'hoje_paga', :'salao', 'fechada', now());

-- Uma hora antes do começo do mês em São Paulo = último dia do mês passado.
-- Escrito assim, e não com data fixa, para o teste não vencer no mês seguinte.
insert into orders (id, salon_id, status, closed_at) values
  (:'mes_passado', :'salao', 'fechada',
   (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 hour')
     at time zone 'America/Sao_Paulo');

insert into orders (id, salon_id, status, closed_at) values
  (:'ainda_aberta',   :'salao',   'aberta',  null),
  (:'sem_pagamento',  :'salao',   'fechada', now()),
  (:'do_vizinho',     :'vizinho', 'fechada', now());

insert into payments (order_id, forma_pagamento, valor) values
  (:'hoje_paga',   'pix',      100.00),
  (:'hoje_paga',   'dinheiro',  50.00),
  (:'mes_passado', 'pix',      900.00),
  (:'ainda_aberta','pix',       77.00),
  (:'do_vizinho',  'pix',      400.00);

-------------------------------------------------------------------- a janela

-- 150 e não 1.227: entram só os dois pagamentos da comanda fechada HOJE. Se
-- este número subir, alguma das quatro travas abaixo caiu.
select is(
  (select faturamento from uso_do_sistema_no_mes where salon_id = :'salao'),
  150.00::numeric,
  'soma os pagamentos da comanda fechada dentro da janela, e so eles'
);

select is(
  (select periodo_inicio from uso_do_sistema_no_mes where salon_id = :'salao'),
  date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date,
  'a janela comeca no dia 1 do mes no relogio de Sao Paulo, nao em UTC'
);

-- A trava que o ensaio provou na mão: comanda de 30/09 às 23h fica FORA da
-- janela de outubro. Sem ela, o percentual do dia 1º usaria o mês inteiro
-- anterior como denominador e diria que o sistema custou quase nada.
select ok(
  (select faturamento from uso_do_sistema_no_mes where salon_id = :'salao') < 900,
  'comanda do mes passado NAO entra: a janela corta na virada do mes'
);

select ok(
  (select faturamento from uso_do_sistema_no_mes where salon_id = :'salao') < 227,
  'comanda ainda ABERTA nao entra, mesmo com pagamento lancado'
);

select is(
  (select faturamento from uso_do_sistema_no_mes where salon_id = :'vizinho'),
  400.00::numeric,
  'cada barbearia soma a propria comanda: o `join` esta correlacionado por salon_id'
);

----------------------------------------------------------------- o trinco

-- As duas coisas que o `create or replace` perdia em silencio, e que a 0190
-- passou a redigitar: o modo da view e quem pode ler.
select ok(
  (select (select option_value from pg_options_to_table(reloptions)
            where option_name = 'security_invoker')::boolean
     from pg_class where oid = 'public.uso_do_sistema_no_mes'::regclass),
  'security_invoker continua ligado: a RLS e a de quem le, nao a do dono da view'
);

select ok(
  not has_table_privilege('anon', 'public.uso_do_sistema_no_mes', 'select'),
  'anon nao le o medidor: o revoke depois do create nao pode ser esquecido'
);

select * from finish();
rollback;
