-- 0175: a irmã em LOTE da 0174 — métricas por cliente para os filtros da lista.
--
-- A ficha pergunta sobre UM cliente (`metricas_do_cliente`); campanha se faz
-- em LOTE — "todos os atrasados", "pacote vencendo", "nunca levou produto".
-- Chamar a RPC da ficha por linha da lista seria N+1; view com invoker
-- herdaria o viés do barbeiro de novo. Esta devolve UMA LINHA POR CLIENTE do
-- salão, DEFINER pelo mesmo motivo da 0174: número de campanha não pode
-- depender de quem abriu a tela.
--
-- O trinco: `p_salon_id in (select private.salon_ids())` dentro do WHERE —
-- salão que não é do usuário devolve linha nenhuma. Dias no fuso de SP;
-- `pacote_vence_em_dias` já sai calculado no servidor para o filtro não
-- fazer conta de data no aparelho (fuso do celular não muda o dia).

create or replace function public.metricas_para_filtros(p_salon_id uuid)
returns table (
  client_id uuid, dias_desde_ultima int, intervalo_mediano_dias int,
  comprou_produto boolean, fechadas int, pacote_restante int, pacote_vence_em_dias int
)
language sql security definer set search_path = public as $$
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as dia),
vis as (
  select a.client_id, (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date as dia
    from appointments a
   where a.salon_id = p_salon_id and a.status = 'concluido' and a.client_id is not null
),
agg_vis as (
  select v.client_id, (select dia from hoje) - max(v.dia) as dias_desde
    from vis v group by v.client_id
),
med as (
  select x.client_id, round(percentile_cont(0.5) within group (order by x.dif))::int as mediana
    from (select vis.client_id, dia - lag(dia) over (partition by vis.client_id order by dia) as dif from vis) x
   where x.dif > 0 group by x.client_id
),
comp as (
  select o.client_id,
         bool_or(oi.tipo = 'produto') as comprou_produto,
         count(distinct o.id)::int as fechadas
    from orders o join order_items oi on oi.order_id = o.id
   where o.salon_id = p_salon_id and o.status = 'fechada' and o.client_id is not null
   group by o.client_id
),
pac as (
  select s.client_id,
         sum(s.restante)::int as restante,
         min(s.expira_em) filter (where s.restante > 0) as expira_min
    from saldo_de_pacotes s
   where s.salon_id = p_salon_id and not s.vencido
   group by s.client_id
)
select c.id, av.dias_desde, md.mediana,
       coalesce(cp.comprou_produto, false), coalesce(cp.fechadas, 0),
       coalesce(pc.restante, 0),
       case when pc.expira_min is null then null
            else (pc.expira_min - (select dia from hoje))::int end
  from clients c
  left join agg_vis av on av.client_id = c.id
  left join med md on md.client_id = c.id
  left join comp cp on cp.client_id = c.id
  left join pac pc on pc.client_id = c.id
 where c.salon_id = p_salon_id
   and p_salon_id in (select private.salon_ids());
$$;

comment on function public.metricas_para_filtros(uuid) is
  'Irma em LOTE da metricas_do_cliente (0174): uma linha por cliente do salao, para os filtros de campanha da lista (atrasados, pacote vencendo, nunca levou produto). DEFINER pelo mesmo motivo — numeros iguais para todo papel; valida o salao por dentro; dias no fuso de SP; anon sem execute.';

revoke all on function public.metricas_para_filtros(uuid) from public, anon;
grant execute on function public.metricas_para_filtros(uuid) to authenticated, service_role;
