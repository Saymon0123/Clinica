-- De onde vem o dinheiro (item 14, parte 2 de 2).
--
-- Fecha o item 14 com as três taxas de GESTÃO: ticket médio, quanto da venda é
-- produto, e qual o melhor dia da semana. O barbeiro não vê nenhuma das três --
-- todas saem de faturamento, e faturamento é do dono (decisão de 21/09).
--
-- ## A armadilha que quase me pegou: duas bases de faturamento
--
-- O cartão "Faturamento" da tela **não soma os itens da comanda** -- ele soma
-- `payments.valor`. As duas contas podem divergir (desconto, pacote cobrindo
-- item, pagamento parcial), e hoje, com 6 comandas, elas batem por sorte.
--
-- Por isso o TICKET MÉDIO sai de `payments`: assim o dono pode dividir o que
-- vê na tela e chegar no mesmo número. Duas bases na mesma tela produziriam
-- dois números que se contradizem, e quem olha não teria como saber qual crer.
--
-- Já a COMPOSIÇÃO tem de sair dos itens, porque `payments` não sabe o que foi
-- comprado -- só quanto entrou. Então ela é declarada pelo que é: participação
-- no que foi VENDIDO, não no faturamento. Os dois totais viajam juntos na
-- resposta, para a tela poder dizer a verdade sobre qual usou.
--
-- ## E são TRÊS tipos, não dois
--
-- `order_items.tipo` aceita 'servico', 'produto' e 'pacote'. "Quanto é
-- produto" sem o pacote no denominador daria um número inflado -- hoje o
-- pacote é R$ 180 de R$ 685, mais de um quarto do que foi vendido.

create or replace function public.composicao_do_periodo(
  p_salon_id uuid,
  p_de date,
  p_ate date
)
returns table (
  faturamento numeric,
  comandas integer,
  vendido_total numeric,
  vendido_servico numeric,
  vendido_produto numeric,
  vendido_pacote numeric,
  melhor_dia smallint,
  melhor_dia_faturamento numeric,
  melhor_dia_comandas integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not (p_salon_id in (select private.salon_ids())) then
    raise exception 'Sem acesso a esta barbearia.' using errcode = '42501';
  end if;

  -- Faturamento é do dono. O barbeiro tem as taxas dele em
  -- `desempenho_do_periodo`, que não tocam em dinheiro do salão.
  if not private.is_manager(p_salon_id) then
    raise exception 'Só a gestão vê o faturamento da barbearia.' using errcode = '42501';
  end if;

  return query
  with tz as (select 'America/Sao_Paulo'::text as z),
  -- `closed_at` e não `created_at`: a comanda entra no período em que FECHOU,
  -- que é a mesma régua do cartão "Faturamento" da tela.
  fechadas as (
    select o.id,
           (o.closed_at at time zone tz.z)::date as dia,
           extract(dow from (o.closed_at at time zone tz.z))::smallint as dow
      from public.orders o
     cross join tz
     where o.salon_id = p_salon_id
       and o.status = 'fechada'
       and o.closed_at is not null
       and (o.closed_at at time zone tz.z)::date between p_de and p_ate
  ),
  pago as (
    select f.id, coalesce(sum(p.valor), 0) as valor, f.dow
      from fechadas f
      left join public.payments p on p.order_id = f.id
     group by f.id, f.dow
  ),
  itens as (
    select i.tipo, sum(i.preco_unitario * i.quantidade) as valor
      from public.order_items i
      join fechadas f on f.id = i.order_id
     group by i.tipo
  ),
  -- O melhor dia da semana pelo dinheiro, não pela contagem: três cortes de
  -- barba não fazem um sábado melhor que uma quinta com dois pacotes.
  por_dia as (
    select dow, sum(valor) as valor, count(*)::int as n
      from pago
     group by dow
     order by sum(valor) desc, count(*) desc
     limit 1
  )
  select
    (select coalesce(sum(valor), 0) from pago),
    (select count(*)::int from pago),
    (select coalesce(sum(valor), 0) from itens),
    (select coalesce(sum(valor), 0) from itens where tipo = 'servico'),
    (select coalesce(sum(valor), 0) from itens where tipo = 'produto'),
    (select coalesce(sum(valor), 0) from itens where tipo = 'pacote'),
    (select dow from por_dia),
    (select valor from por_dia),
    (select n from por_dia);
end;
$function$;

-- O trinco, reposto à mão: função nova nasce com EXECUTE para `public`.
revoke all on function public.composicao_do_periodo(uuid, date, date)
  from public, anon;
grant execute on function public.composicao_do_periodo(uuid, date, date)
  to authenticated, service_role;
