-- O dia de fechar a comissão (migration 0186).
--
-- ## O que este teste guarda
--
-- A régua de **o que venceu e o que ainda não**, que é dinheiro e por isso não
-- pode errar: com fechamento no dia 5 e hoje dia 20, a comissão do atendimento
-- do dia 10 **não está atrasada** — ela pertence ao próximo fechamento. Somá-la
-- faria o dono pagar adiantado ou, pior, desconfiar do número e parar de
-- confiar na tela.
--
-- A data entra por parâmetro em `private.fechamento_vigente` justamente para
-- este arquivo poder testar fevereiro e a virada de ano **sem viajar no
-- tempo**. Expressão enterrada numa view que lê `now()` só se testa no dia em
-- que o calendário colabora.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(12);

\set salao   'eeee1000-0000-0000-0000-000000000001'
\set prof    'eeee1100-0000-0000-0000-000000000001'
\set servico 'eeee1200-0000-0000-0000-000000000001'
\set cliente 'eeee1300-0000-0000-0000-000000000001'

------------------------------------------------- a conta da data, sozinha

select is(
  private.fechamento_vigente(5, date '2026-09-20'),
  date '2026-09-05',
  'dia 5, hoje 20/09: o fechamento deste mes ja passou e e ele que vale'
);

select is(
  private.fechamento_vigente(5, date '2026-09-03'),
  date '2026-08-05',
  'dia 5, hoje 03/09: ainda nao chegou, entao vale o do mes anterior'
);

select is(
  private.fechamento_vigente(5, date '2026-09-05'),
  date '2026-09-05',
  'dia 5, hoje 05/09: o PROPRIO dia conta como fechado'
);

select is(
  private.fechamento_vigente(31, date '2026-02-15'),
  date '2026-01-31',
  'dia 31, hoje 15/02: fevereiro nao tem 31, e o anterior e 31/01'
);

select is(
  private.fechamento_vigente(31, date '2026-03-01'),
  date '2026-02-28',
  'dia 31 em fevereiro de 2026 e APARADO para 28 -- travar o campo em 28 seria mentir para quem fecha no ultimo dia'
);

select is(
  private.fechamento_vigente(10, date '2026-01-05'),
  date '2025-12-10',
  'dia 10, hoje 05/01: volta para dezembro, atravessando o ano'
);

select is(
  private.fechamento_vigente(1, date '2026-01-01'),
  date '2026-01-01',
  'dia 1, hoje 01/01: nao escorrega para dezembro'
);

------------------------------------------------------------ e o que vencer

insert into salons (id, nome, ativo) values (:'salao', 'Fecha Dia 5', true);
insert into professionals (id, salon_id, nome, ativo, comissao_percentual)
values (:'prof', :'salao', 'Barbeiro Um', true, 50);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 40, 100, true);
insert into clients (id, salon_id, nome) values (:'cliente', :'salao', 'Cliente Um');

-- Helper: uma comanda fechada em tal dia, com comissao de R$ 50 (50% de 100).
create or replace function pg_temp.comanda(p_dia date, p_paga boolean) returns void
language plpgsql as $$
declare o uuid; it uuid;
begin
  insert into orders (salon_id, client_id, professional_id, status, created_at, closed_at)
  values ('eeee1000-0000-0000-0000-000000000001', 'eeee1300-0000-0000-0000-000000000001',
          'eeee1100-0000-0000-0000-000000000001', 'fechada',
          (p_dia + time '10:00') at time zone 'America/Sao_Paulo',
          (p_dia + time '10:40') at time zone 'America/Sao_Paulo')
  returning id into o;
  insert into order_items (order_id, tipo, service_id, professional_id, quantidade, preco_unitario)
  values (o, 'servico', 'eeee1200-0000-0000-0000-000000000001',
          'eeee1100-0000-0000-0000-000000000001', 1, 100) returning id into it;
  insert into commissions (professional_id, order_item_id, percentual_aplicado, valor_calculado, pago)
  values ('eeee1100-0000-0000-0000-000000000001', it, 50, 50, p_paga);
end;
$$;

-- Sem dia definido, a faixa não existe de jeito nenhum.
select is(
  (select count(*)::int from comissoes_a_pagar where salon_id = :'salao'),
  0,
  'barbearia sem dia_fechamento_comissao nao aparece: a faixa so existe para quem escolheu'
);

update salons set dia_fechamento_comissao = 5 where id = :'salao';

-- Três comandas: uma antes do fechamento vigente, uma depois, e uma já paga.
-- O fechamento vigente é calculado a partir de HOJE, então ancoro as datas nele.
select pg_temp.comanda(private.fechamento_vigente(5, (now() at time zone 'America/Sao_Paulo')::date) - 3, false);
select pg_temp.comanda(private.fechamento_vigente(5, (now() at time zone 'America/Sao_Paulo')::date) + 1, false);
select pg_temp.comanda(private.fechamento_vigente(5, (now() at time zone 'America/Sao_Paulo')::date) - 5, true);

select is(
  (select valor from comissoes_a_pagar where salon_id = :'salao'),
  50::numeric,
  'so a comanda ANTES do fechamento entra: R$ 50 de tres comandas de R$ 50 cada'
);

select is(
  (select itens from comissoes_a_pagar where salon_id = :'salao'),
  1,
  'um item: o de depois do fechamento e do PROXIMO ciclo, e o pago nao se cobra duas vezes'
);

select is(
  (select fecha_em from comissoes_a_pagar where salon_id = :'salao'),
  private.fechamento_vigente(5, (now() at time zone 'America/Sao_Paulo')::date),
  'a view devolve a data do fechamento, para a faixa dizer "fechada em 05/09" em vez de so o valor'
);

-- Pago tudo, a faixa desaparece: ela é a pendência, não um extrato.
update commissions set pago = true
 where professional_id = :'prof';

select is(
  (select count(*)::int from comissoes_a_pagar where salon_id = :'salao'),
  0,
  'com tudo pago a faixa sai da tela -- aviso que fica depois de resolvido vira decoracao'
);

select * from finish();
rollback;
