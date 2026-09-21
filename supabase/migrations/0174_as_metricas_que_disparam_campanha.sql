-- 0174: as métricas do cliente que disparam campanha — iguais para todo papel.
--
-- O PEDIDO (21/09): a ficha do cliente ganhar métricas de campanha — última
-- visita, ritmo, atraso, ticket, serviço de sempre, faltas, avaliação.
--
-- POR QUE UMA RPC, E DEFINER. A policy de `appointments` mostra ao barbeiro
-- só os horários DELE ("leitura conforme papel"). Métrica calculada no
-- navegador herda esse recorte: o barbeiro veria "última visita há 40 dias"
-- para um cliente que veio há 3 com outro barbeiro — e campanha disparada por
-- número enviesado é campanha errada. A RPC roda por cima da RLS, mas valida
-- POR DENTRO que o cliente pertence a um salão de quem chama (o padrão de
-- `situacao_do_acesso`), e devolve AGREGADOS — o barbeiro fica sabendo que o
-- cliente veio, não a agenda de ninguém.
--
-- FUSO: "dias desde" e datas comparam DIAS DE SÃO PAULO, nunca instantes UTC
-- — a mesma régua de todo o resto do banco.
--
-- ZERO HISTÓRICO É NULL, NÃO ZERO FALSO: cliente novo devolve nulls e a ficha
-- mostra "—". Mediana exige pelo menos 2 visitas concluídas (1 visita não tem
-- intervalo). Ticket usa nullif para nunca dividir por zero.

create or replace function public.metricas_do_cliente(p_client_id uuid)
returns table (
  ultima_visita date,
  dias_desde_ultima int,
  concluidos int,
  intervalo_mediano_dias int,
  ticket_medio numeric,
  servico_top text,
  comprou_produto boolean,
  faltas int,
  cancelamentos_dele int,
  ultima_nota int,
  ultima_avaliacao_em date
)
language sql
security definer
set search_path = public
as $$
with autorizado as (
  -- O trinco do definer: só clientes de salões de quem chama. Fora disso, a
  -- consulta devolve linha nenhuma — nem "existe", nem "não existe".
  select c.id, c.salon_id
    from clients c
   where c.id = p_client_id
     and c.salon_id in (select private.salon_ids())
),
hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as dia
),
visitas as (
  select (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date as dia
    from appointments a
    join autorizado aut on aut.id = a.client_id
   where a.status = 'concluido'
),
intervalos as (
  select dia - lag(dia) over (order by dia) as dif
    from visitas
),
vendas as (
  select o.id,
         sum(oi.quantidade * oi.preco_unitario) as total
    from orders o
    join autorizado aut on aut.id = o.client_id
    join order_items oi on oi.order_id = o.id
   where o.status = 'fechada'
   group by o.id
),
servicos_consumidos as (
  select s.nome, count(*) as vezes, max(o.closed_at) as ultima
    from orders o
    join autorizado aut on aut.id = o.client_id
    join order_items oi on oi.order_id = o.id
    join services s on s.id = oi.service_id
   where o.status = 'fechada' and oi.tipo = 'servico'
   group by s.nome
)
select
  (select max(dia) from visitas) as ultima_visita,
  (select (select dia from hoje) - max(dia) from visitas)::int as dias_desde_ultima,
  (select count(*) from visitas)::int as concluidos,
  (select round(percentile_cont(0.5) within group (order by dif))
     from intervalos where dif is not null and dif > 0)::int as intervalo_mediano_dias,
  (select round(avg(total), 2) from vendas) as ticket_medio,
  (select nome from servicos_consumidos order by vezes desc, ultima desc limit 1) as servico_top,
  (select exists (
     select 1 from orders o
       join autorizado aut on aut.id = o.client_id
       join order_items oi on oi.order_id = o.id
      where o.status = 'fechada' and oi.tipo = 'produto')) as comprou_produto,
  (select count(*) from appointments a join autorizado aut on aut.id = a.client_id
    where a.status = 'faltou')::int as faltas,
  (select count(*) from appointments a join autorizado aut on aut.id = a.client_id
    where a.status = 'cancelado' and a.cancelado_por = 'cliente')::int as cancelamentos_dele,
  (select av.nota from avaliacoes av join autorizado aut on aut.id = av.client_id
    order by av.criado_em desc limit 1)::int as ultima_nota,
  (select (av.criado_em at time zone 'America/Sao_Paulo')::date
     from avaliacoes av join autorizado aut on aut.id = av.client_id
    order by av.criado_em desc limit 1) as ultima_avaliacao_em
 where exists (select 1 from autorizado);
$$;

comment on function public.metricas_do_cliente(uuid) is
  'Agregados de campanha da ficha do cliente, IGUAIS para todo papel do salao (definer valida o vinculo por dentro; a RLS de appointments mostraria ao barbeiro so os horarios dele e enviesaria a metrica). Dias no fuso de Sao Paulo; sem historico devolve nulls; fora do salao devolve linha nenhuma.';

revoke all on function public.metricas_do_cliente(uuid) from public, anon;
grant execute on function public.metricas_do_cliente(uuid) to authenticated, service_role;
