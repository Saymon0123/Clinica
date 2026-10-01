-- O fechamento da comissão (migrations 0186, 0187 e 0188).
--
-- ## O que este teste guarda
--
-- **1. A régua de o que venceu e o que ainda não**, que é dinheiro: com
-- fechamento no dia 5 e hoje dia 20, a comissão do atendimento do dia 10 não
-- está atrasada — ela pertence ao próximo fechamento. Somá-la faria o dono pagar
-- adiantado ou desconfiar do número e parar de confiar na tela.
--
-- **2. Os dois ciclos.** A 0186 entregou só o mensal, por suposição minha que
-- não foi conferida: barbearia pagando o barbeiro toda semana é mais comum que
-- por mês. A 0187 acrescentou o semanal.
--
-- **3. O CHECK que passava em nulo.** A trava da 0187 deixava entrar ciclo sem
-- dia por causa da lógica de três valores: `true and NULL` dá NULL, e CHECK só
-- recusa em FALSE. A 0188 fechou. Sem as três asserções do fim, isso volta.
--
-- A data entra por parâmetro em `private.fechamento_vigente` justamente para
-- este arquivo testar fevereiro e a virada de ano **sem viajar no tempo**.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(20);

\set salao   'eeee1000-0000-0000-0000-000000000001'
\set prof    'eeee1100-0000-0000-0000-000000000001'
\set servico 'eeee1200-0000-0000-0000-000000000001'
\set cliente 'eeee1300-0000-0000-0000-000000000001'

---------------------------------------------------- o ciclo MENSAL, na conta

select is(private.fechamento_vigente('mensal', 5, date '2026-09-20'), date '2026-09-05',
  'mensal dia 5, hoje 20/09: o fechamento deste mes ja passou e e ele que vale');

select is(private.fechamento_vigente('mensal', 5, date '2026-09-03'), date '2026-08-05',
  'mensal dia 5, hoje 03/09: ainda nao chegou, vale o do mes anterior');

select is(private.fechamento_vigente('mensal', 5, date '2026-09-05'), date '2026-09-05',
  'mensal dia 5, hoje 05/09: o PROPRIO dia conta como fechado');

select is(private.fechamento_vigente('mensal', 31, date '2026-02-15'), date '2026-01-31',
  'mensal dia 31, hoje 15/02: fevereiro nao tem 31, e o anterior e 31/01');

select is(private.fechamento_vigente('mensal', 31, date '2026-03-01'), date '2026-02-28',
  'mensal dia 31 em fevereiro de 2026 e APARADO para 28 -- travar o campo em 28 mentiria para quem fecha no ultimo dia');

select is(private.fechamento_vigente('mensal', 10, date '2026-01-05'), date '2025-12-10',
  'mensal dia 10, hoje 05/01: volta para dezembro, atravessando o ano');

select is(private.fechamento_vigente('mensal', 1, date '2026-01-01'), date '2026-01-01',
  'mensal dia 1, hoje 01/01: nao escorrega para dezembro');

--------------------------------------------------- o ciclo SEMANAL, na conta

-- 30/09/2026 e uma quarta-feira. 0 = domingo … 6 = sabado.
select is(private.fechamento_vigente('semanal', 1, date '2026-09-30'), date '2026-09-28',
  'semanal na segunda, hoje quarta: vale a segunda que passou');

select is(private.fechamento_vigente('semanal', 3, date '2026-09-30'), date '2026-09-30',
  'semanal na quarta, hoje quarta: o PROPRIO dia conta, mesma regua do mensal');

select is(private.fechamento_vigente('semanal', 5, date '2026-09-30'), date '2026-09-25',
  'semanal na sexta, hoje quarta: a sexta desta semana ainda nao chegou, vale a anterior');

select is(private.fechamento_vigente('semanal', 0, date '2027-01-01'), date '2026-12-27',
  'semanal no domingo, hoje 01/01/2027: atravessa o ano sem tropecar');

------------------------------------------------- e o que a view deixa passar

insert into salons (id, nome, ativo) values (:'salao', 'Fecha Toda Segunda', true);
insert into professionals (id, salon_id, nome, ativo, comissao_percentual)
values (:'prof', :'salao', 'Barbeiro Um', true, 50);
insert into services (id, salon_id, nome, duracao_minutos, preco, ativo)
values (:'servico', :'salao', 'Corte', 40, 100, true);
insert into clients (id, salon_id, nome) values (:'cliente', :'salao', 'Cliente Um');

-- Uma comanda fechada em tal dia, com comissão de R$ 50 (50% de 100).
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

select is(
  (select count(*)::int from comissoes_a_pagar where salon_id = :'salao'),
  0,
  'barbearia sem ciclo definido nao aparece: a faixa so existe para quem escolheu'
);

update salons set ciclo_comissao = 'semanal', dia_fechamento_comissao = 1 where id = :'salao';

-- Ancoradas no fechamento vigente, para o teste não depender do dia em que roda.
select pg_temp.comanda(private.fechamento_vigente('semanal', 1, (now() at time zone 'America/Sao_Paulo')::date) - 2, false);
select pg_temp.comanda(private.fechamento_vigente('semanal', 1, (now() at time zone 'America/Sao_Paulo')::date) + 1, false);
select pg_temp.comanda(private.fechamento_vigente('semanal', 1, (now() at time zone 'America/Sao_Paulo')::date) - 4, true);

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
  private.fechamento_vigente('semanal', 1, (now() at time zone 'America/Sao_Paulo')::date),
  'a view devolve a data do fechamento, para a faixa dizer "fechada na segunda, 28/09"'
);

select is(
  (select ciclo_comissao from comissoes_a_pagar where salon_id = :'salao'),
  'semanal',
  'e devolve o ciclo, porque a faixa so escreve o nome do dia no semanal'
);

update commissions set pago = true where professional_id = :'prof';

select is(
  (select count(*)::int from comissoes_a_pagar where salon_id = :'salao'),
  0,
  'com tudo pago a faixa sai da tela -- aviso que fica depois de resolvido vira decoracao'
);

------------------------------------------- o CHECK que passava em nulo (0188)

-- A trava da 0187 aceitava estes tres por causa da logica de tres valores:
-- `true and NULL` da NULL, e CHECK so recusa em FALSE.
select throws_ok(
  format($$update salons set ciclo_comissao = 'semanal', dia_fechamento_comissao = null where id = %L$$, :'salao'),
  '23514', null,
  'ciclo SEM dia e recusado: os dois andam juntos ou os dois sao nulos'
);

select throws_ok(
  format($$update salons set ciclo_comissao = null, dia_fechamento_comissao = 5 where id = %L$$, :'salao'),
  '23514', null,
  'dia SEM ciclo e recusado: o numero sozinho nao diz se e dia do mes ou da semana'
);

select throws_ok(
  format($$update salons set ciclo_comissao = 'xpto', dia_fechamento_comissao = 5 where id = %L$$, :'salao'),
  '23514', null,
  'ciclo inventado e recusado -- de quebra, a regra da 0188 virou a validacao do enum'
);

select * from finish();
rollback;
