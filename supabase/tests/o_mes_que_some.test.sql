-- O mês que some (migration 0161 — achado A14).
--
-- Este é o teste de um defeito que não aparece em tela nenhuma e não deixa
-- rastro: uma fatura que nunca nasceu é invisível para quem só olha as faturas
-- que existem. Ele prova as três coisas que a 0161 mudou — a janela que
-- recupera o buraco, a barbearia quebrada que não derruba as outras, e o
-- alarme que avisa quando mesmo assim ficou faltando.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(9);

-- Tudo relativo ao relógio, nunca a data fixa: o CI roda em qualquer mês, e
-- teste amarrado em setembro é teste que mente em outubro.
create or replace function pg_temp.hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Último dia do mês passado — o fim da janela do fechamento.
create or replace function pg_temp.fim_da_janela() returns date
language sql stable as $$ select (date_trunc('month', pg_temp.hoje()) - interval '1 day')::date $$;

-- Primeiro dia do mês passado — onde a janela ANTIGA sempre começava.
create or replace function pg_temp.janela_antiga() returns date
language sql stable as $$ select (date_trunc('month', pg_temp.hoje()) - interval '1 month')::date $$;

-- Primeiro dia de dois meses atrás — onde o buraco começa.
create or replace function pg_temp.buraco_comeca() returns date
language sql stable as $$ select (date_trunc('month', pg_temp.hoje()) - interval '2 months')::date $$;

\set salao_ruim   'dddd9000-0000-0000-0000-000000000001'
\set salao_bom    'dddd9000-0000-0000-0000-000000000002'
\set salao_buraco 'dddd9000-0000-0000-0000-000000000003'
\set salao_em_dia 'dddd9000-0000-0000-0000-000000000004'
\set salao_fora   'dddd9000-0000-0000-0000-000000000005'

insert into salons (id, nome, cobravel) values
  (:'salao_ruim',   'Quebra No Preco',  true),
  (:'salao_bom',    'Vem Depois Dela',  true),
  (:'salao_buraco', 'Perdeu Um Mes',    true),
  (:'salao_em_dia', 'Em Dia',           true),
  (:'salao_fora',   'Fora Da Cobranca', false);

-- O teste terminou no fim do mês retrasado: assim a janela normal é o mês
-- passado inteiro. A do buraco terminou ANTES do buraco, de propósito — o corte
-- do teste grátis dentro de `gerar_fatura_de_uso` também empurra o início para
-- frente, e ele engoliria o buraco que este teste existe para provar.
insert into subscriptions (salon_id, status, acesso_ate, trial_ate) values
  (:'salao_ruim',   'ativa', pg_temp.hoje() + 30, pg_temp.janela_antiga() - 1),
  (:'salao_bom',    'ativa', pg_temp.hoje() + 30, pg_temp.janela_antiga() - 1),
  (:'salao_buraco', 'ativa', pg_temp.hoje() + 30, pg_temp.buraco_comeca() - 40),
  (:'salao_em_dia', 'ativa', pg_temp.hoje() + 30, pg_temp.janela_antiga() - 1),
  (:'salao_fora',   'ativa', pg_temp.hoje() + 30, pg_temp.janela_antiga() - 1);

-- Duas barbearias já faturadas: uma parou dois meses atrás (o buraco), a outra
-- está em dia. A terceira, fora da cobrança, também parou — e não pode alarmar.
insert into faturas_de_uso (salon_id, periodo_inicio, periodo_fim, motivo,
                            barbeiros, preco_unitario, agendamentos, lembretes, reativacoes,
                            valor, valor_gerado, detalhe)
values
  (:'salao_buraco', pg_temp.buraco_comeca() - 31, pg_temp.buraco_comeca() - 1, 'mensal',
   1, 0.75, 0, 0, 0, 0, 0, '[]'::jsonb),
  (:'salao_em_dia', pg_temp.janela_antiga(), pg_temp.fim_da_janela(), 'mensal',
   1, 0.75, 0, 0, 0, 0, 0, '[]'::jsonb),
  (:'salao_fora',   pg_temp.buraco_comeca() - 31, pg_temp.buraco_comeca() - 1, 'mensal',
   1, 0.75, 0, 0, 0, 0, 0, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- O alarme da fatura que não nasceu — medido ANTES de consertar o buraco
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from auditoria_cobranca
    where salon_id = :'salao_buraco' and chave like 'fatura-nao-nasceu:%'),
  1,
  'barbearia que parou de ser faturada vira alarme'
);

select is(
  (select count(*)::int from auditoria_cobranca
    where salon_id = :'salao_em_dia' and chave like 'fatura-nao-nasceu:%'),
  0,
  'quem esta em dia nao alarma — senao o alarme vira ruido e ninguem le'
);

select is(
  (select count(*)::int from auditoria_cobranca
    where salon_id = :'salao_fora' and chave like 'fatura-nao-nasceu:%'),
  0,
  'barbearia fora da cobranca nunca alarma: nao ter fatura e o esperado dela'
);

-- O alarme só serve se chegar ao canal que já existe. `auditoria_pendente` é o
-- que o fluxo "Auditoria do Agente" lê para mandar e-mail.
select is(
  (select count(*)::int from auditoria_pendente
    where salon_id = :'salao_buraco' and chave like 'fatura-nao-nasceu:%'),
  1,
  'e chega em auditoria_pendente, que e por onde o aviso sai'
);

-- ---------------------------------------------------------------------------
-- Uma barbearia quebrada não derruba as outras
-- ---------------------------------------------------------------------------
-- A falha é injetada onde ela de fato poderia acontecer: no preço. Sete
-- barbeiros é o sinal combinado; a troca vale só dentro desta transação.
insert into professionals (salon_id, nome)
select :'salao_ruim', 'Barbeiro ' || g from generate_series(1, 7) g;

create or replace function public.preco_por_uso(p_barbeiros integer)
returns numeric language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_barbeiros = 7 then
    raise exception 'falha de proposito no preco';
  end if;
  return 0.75;
end;
$$;

-- Duas de propósito: a que vem depois da quebrada e a que tinha buraco. A
-- quebrada levanta, a que está em dia não tem o que faturar, e a que está fora
-- da cobrança devolve nulo. O número importa: ele era sempre zero antes da
-- 0161, porque `registro is not null` só é verdadeiro com TODAS as colunas
-- preenchidas — e fatura nova tem `paga_em` nula por definição.
select is(
  (select fechar_mes_de_uso()),
  2,
  'o fechamento roda ate o fim com uma barbearia quebrando no meio, e diz quantas faturou'
);

select is(
  (select count(*)::int from faturas_de_uso where salon_id = :'salao_ruim'),
  0,
  'a barbearia que quebrou nao gera fatura'
);

select is(
  (select count(*)::int from faturas_de_uso where salon_id = :'salao_bom'),
  1,
  'e a que vinha DEPOIS dela na fila e faturada assim mesmo'
);

-- ---------------------------------------------------------------------------
-- O buraco é recuperado
-- ---------------------------------------------------------------------------

select is(
  (select periodo_inicio from faturas_de_uso
    where salon_id = :'salao_buraco' and periodo_fim = pg_temp.fim_da_janela()),
  pg_temp.buraco_comeca(),
  'a fatura nova comeca onde a anterior parou, e nao no dia 1o do mes passado'
);

select is(
  (select periodo_fim from faturas_de_uso
    where salon_id = :'salao_buraco' and periodo_inicio = pg_temp.buraco_comeca()),
  pg_temp.fim_da_janela(),
  'e cobre o buraco inteiro ate o fim do mes passado, numa fatura so'
);

select * from finish();
rollback;
