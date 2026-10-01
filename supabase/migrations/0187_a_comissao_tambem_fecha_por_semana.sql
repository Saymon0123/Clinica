-- A comissão também fecha por semana.
--
-- A 0186 entregou só o ciclo MENSAL (dia do mês), e isso foi uma suposição
-- minha que não foi conferida com o dono. Barbearia pagando o barbeiro **toda
-- semana** é mais comum que por mês — quem trabalha de cadeira costuma receber
-- na segunda ou na quarta, não no dia 5.
--
-- A 0186 já está aplicada, então ela não se reescreve: esta migration estende.
--
-- ## Por que duas colunas e não uma
--
-- `dia_fechamento_comissao` sozinho ficaria com dois significados (1–31 no
-- mensal, 0–6 no semanal) e nada no banco diria qual deles vale. Com
-- `ciclo_comissao` ao lado, **um CHECK só** garante que o par faz sentido — não
-- existe estado em que o número signifique uma coisa e a tela leia outra.

alter table public.salons
  add column ciclo_comissao text;

-- A trava da 0186 olhava o dia sozinho e aceitaria 0 (que não é dia do mês) ou
-- 31 num ciclo semanal (que não é dia da semana). Sai, e entra a que amarra os
-- dois campos.
alter table public.salons
  drop constraint salons_dia_fechamento_comissao_valido;

alter table public.salons
  add constraint salons_fechamento_comissao_valido
  check (
    -- Não definido: os dois nulos juntos, nunca um sem o outro.
    (ciclo_comissao is null and dia_fechamento_comissao is null)
    or (ciclo_comissao = 'mensal'  and dia_fechamento_comissao between 1 and 31)
    -- 0 = domingo … 6 = sábado, a mesma régua do `extract(dow)` do Postgres e
    -- de `professional_schedules.dia_semana`.
    or (ciclo_comissao = 'semanal' and dia_fechamento_comissao between 0 and 6)
  );

-- Quem já tinha dia definido pela 0186 era mensal por construção.
update public.salons
   set ciclo_comissao = 'mensal'
 where dia_fechamento_comissao is not null
   and ciclo_comissao is null;

comment on column public.salons.ciclo_comissao is
  'semanal (dia_fechamento_comissao = 0..6, domingo a sábado) ou mensal (1..31). Nulo junto com o dia = o dono não definiu.';

comment on column public.salons.dia_fechamento_comissao is
  'Dia do fechamento. No ciclo mensal, 1 a 31 aparado pelo último dia do mês; no semanal, 0 a 6 (domingo a sábado). O significado vem de ciclo_comissao.';

------------------------------------------------------------------------------
-- O fechamento vigente, agora nos dois ciclos
------------------------------------------------------------------------------
-- Assinatura nova (três argumentos), porque o ciclo entra na conta. A antiga é
-- derrubada no fim, depois de a view parar de usá-la.
create or replace function private.fechamento_vigente(
  p_ciclo text,
  p_dia integer,
  p_hoje date
)
returns date
language sql
immutable
as $function$
  select case
           when p_ciclo = 'semanal' then
             -- A ocorrência mais recente daquele dia da semana. Quando hoje JÁ
             -- é o dia, a diferença é zero e vale hoje -- mesma régua do
             -- mensal, em que o próprio dia conta como fechado.
             p_hoje - ((extract(dow from p_hoje)::int - p_dia + 7) % 7)
           when p_ciclo = 'mensal' then
             case
               when extract(day from p_hoje)::int >= least(p_dia, ultimo_deste) then
                 (date_trunc('month', p_hoje)
                  + make_interval(days => least(p_dia, ultimo_deste) - 1))::date
               else
                 (date_trunc('month', p_hoje - interval '1 month')
                  + make_interval(days => least(p_dia, ultimo_anterior) - 1))::date
             end
           else null
         end
    from (
      select extract(day from
               (date_trunc('month', p_hoje) + interval '1 month' - interval '1 day'))::int
             as ultimo_deste,
             extract(day from
               (date_trunc('month', p_hoje - interval '1 month') + interval '1 month' - interval '1 day'))::int
             as ultimo_anterior
    ) t;
$function$;

revoke all on function private.fechamento_vigente(text, integer, date) from public, anon;
grant execute on function private.fechamento_vigente(text, integer, date) to authenticated, service_role;

------------------------------------------------------------------------------
-- A view, recriada por inteiro
------------------------------------------------------------------------------
-- `drop` + `create`, e não replace: a regra da casa. O replace perde em
-- silêncio o `security_invoker` e os grants.
drop view public.comissoes_a_pagar;

create view public.comissoes_a_pagar
with (security_invoker = on) as
select s.id as salon_id,
       s.ciclo_comissao,
       s.dia_fechamento_comissao as dia_de_fechamento,
       private.fechamento_vigente(
         s.ciclo_comissao, s.dia_fechamento_comissao,
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
 where s.ciclo_comissao is not null
   -- `<=`: o fechamento cobre o próprio dia dele, nos dois ciclos.
   and (o.closed_at at time zone 'America/Sao_Paulo')::date
       <= private.fechamento_vigente(
            s.ciclo_comissao, s.dia_fechamento_comissao,
            (now() at time zone 'America/Sao_Paulo')::date
          )
 group by s.id, s.ciclo_comissao, s.dia_fechamento_comissao, p.id, p.nome
having sum(c.valor_calculado) > 0;

-- Sem `revoke`/`grant` aqui, de propósito: a view fica com o padrão do schema,
-- como as outras doze deste projeto. Cheguei a escrever um revoke de `anon` e
-- tirei depois de provar que ele não ganha nada — o `anon` já bate em
-- "permission denied" na própria `private.fechamento_vigente` (42501), e
-- `authenticated` sem sessão recebe zero linha porque `private.salon_ids()`
-- volta vazio e a RLS não devolve nada. Duas camadas antes desta.
comment on view public.comissoes_a_pagar is
  'Comissão não paga de trabalho feito até o fechamento vigente, por barbeiro. Atende os dois ciclos (semanal e mensal). Alimenta a faixa de aviso do Financeiro.';

-- Agora que a view usa a nova, a antiga sai: duas assinaturas vivas é convite
-- para alguém chamar a errada e receber o ciclo ignorado em silêncio.
drop function private.fechamento_vigente(integer, date);
