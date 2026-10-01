-- O dia de fechar a comissão, e o aviso de que ele chegou.
--
-- O modal de fechamento (`FechamentoComissaoModal`) já existe e funciona: o
-- dono escolhe o mês, vê o que cada barbeiro ganhou e marca como pago. O que
-- faltava era **alguém avisar que chegou a hora**. Hoje o ciclo depende de o
-- dono lembrar sozinho — e barbeiro cobrando comissão atrasada é a conversa
-- mais azeda que existe numa barbearia.

alter table public.salons
  add column dia_fechamento_comissao smallint;

alter table public.salons
  add constraint salons_dia_fechamento_comissao_valido
  check (dia_fechamento_comissao is null
         or (dia_fechamento_comissao between 1 and 31));

comment on column public.salons.dia_fechamento_comissao is
  'Dia do mês em que a barbearia fecha a comissão (1 a 31, aparado pelo último dia do mês). Nulo = o dono não definiu, e o aviso não aparece.';

------------------------------------------------------------------------------
-- 1. Qual é o fechamento que vale agora
------------------------------------------------------------------------------
-- Função, e não expressão solta dentro da view, por um motivo só: **a data
-- entra por parâmetro**, então o pgTAP testa janeiro, fevereiro e a virada do
-- mês sem precisar viajar no tempo. Expressão enterrada numa view que lê
-- `now()` só se consegue testar no dia em que o calendário colabora.
--
-- A régua: é a ocorrência MAIS RECENTE do dia escolhido, que pode ser deste mês
-- (se o dia já passou) ou do mês anterior (se ainda não chegou).
--
-- E o dia é APARADO pelo último dia do mês: quem escolhe 31 fecha dia 28 em
-- fevereiro e 30 em abril. Travar o campo em 28 seria mais simples e mentiria
-- para quem fecha no último dia do mês.
create or replace function private.fechamento_vigente(p_dia integer, p_hoje date)
returns date
language sql
immutable
as $function$
  select case
           when extract(day from p_hoje)::int >= dia_neste then
             (date_trunc('month', p_hoje) + make_interval(days => dia_neste - 1))::date
           else
             (date_trunc('month', p_hoje - interval '1 month')
              + make_interval(days => dia_no_anterior - 1))::date
         end
    from (
      select least(p_dia, extract(day from
                     (date_trunc('month', p_hoje) + interval '1 month' - interval '1 day'))::int
             ) as dia_neste,
             least(p_dia, extract(day from
                     (date_trunc('month', p_hoje - interval '1 month') + interval '1 month' - interval '1 day'))::int
             ) as dia_no_anterior
    ) t;
$function$;

revoke all on function private.fechamento_vigente(integer, date) from public, anon;
grant execute on function private.fechamento_vigente(integer, date) to authenticated, service_role;

------------------------------------------------------------------------------
-- 2. O que está em aberto e já venceu, por barbeiro
------------------------------------------------------------------------------
-- A parte que precisa estar certa porque é dinheiro: se o fechamento é dia 5 e
-- hoje é dia 20, a comissão do atendimento do dia 10 **não está atrasada** —
-- ela pertence ao próximo fechamento. Somá-la aqui faria o dono pagar adiantado
-- ou, pior, desconfiar do número e parar de confiar na tela.
--
-- `security_invoker` para a RLS de `commissions` e `professionals` valer como
-- vale em qualquer outra tela: o barbeiro vê a própria linha, o gestor vê todas.
create or replace view public.comissoes_a_pagar
with (security_invoker = on) as
select s.id as salon_id,
       s.dia_fechamento_comissao as dia_de_fechamento,
       private.fechamento_vigente(
         s.dia_fechamento_comissao,
         (now() at time zone 'America/Sao_Paulo')::date
       ) as fecha_em,
       p.id as professional_id,
       p.nome as profissional,
       count(*)::int as itens,
       sum(c.valor_calculado) as valor
  from public.salons s
  join public.orders o
    on o.salon_id = s.id and o.status = 'fechada' and o.closed_at is not null
  join public.order_items oi on oi.order_id = o.id
  join public.commissions c on c.order_item_id = oi.id and not c.pago
  join public.professionals p on p.id = c.professional_id
 where s.dia_fechamento_comissao is not null
   -- `<=`: o fechamento cobre o próprio dia dele. Trabalho do dia 5, com
   -- fechamento no dia 5, entra NESTE fechamento e não no seguinte.
   and (o.closed_at at time zone 'America/Sao_Paulo')::date
       <= private.fechamento_vigente(
            s.dia_fechamento_comissao,
            (now() at time zone 'America/Sao_Paulo')::date
          )
 group by s.id, s.dia_fechamento_comissao, p.id, p.nome
having sum(c.valor_calculado) > 0;

comment on view public.comissoes_a_pagar is
  'Comissão não paga de trabalho feito até o fechamento vigente, por barbeiro. Só aparece para barbearia que definiu dia_fechamento_comissao. Alimenta a faixa de aviso do Financeiro.';
