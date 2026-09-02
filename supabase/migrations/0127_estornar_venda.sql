-- 0127: estornar venda (roteiro, passo 1.8 / achado 8)
--
-- Depois de gravada, uma comanda não tinha detalhe, edição nem estorno. O
-- banco aceita `status = 'cancelada'`, mas nenhum caminho do app gravava isso.
-- Digitou o produto errado, o cliente desistiu, cobrou duas vezes: o número
-- ficava no faturamento para sempre — e o estoque e a comissão junto com ele.
--
-- Decisões que moram aqui:
--
-- * **Estoque volta por movimento INVERSO**, não apagando o movimento
--   original. `stock_movements` não guarda de qual venda veio (só produto,
--   tipo, quantidade e motivo), então não há como achar as linhas da venda —
--   e apagar histórico de estoque seria pior que registrar a devolução. O
--   trigger reversível da 0109 aplica o delta sozinho.
--
-- * **Comissão já paga BLOQUEIA o estorno.** Se o fechamento do mês já pagou
--   aquele atendimento, apagar a linha faria o relatório do barbeiro divergir
--   do dinheiro que ele recebeu. Melhor recusar e explicar do que corromper
--   um acerto que já aconteceu.
--
-- * **Pagamentos ficam.** O faturamento e o esperado no caixa já filtram por
--   `status = 'fechada'`, então marcar a comanda como cancelada tira o valor
--   das contas sem apagar o registro de que houve pagamento.
create or replace function public.estornar_venda(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order public.orders%rowtype;
  v_comissoes_pagas int;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.salon_id not in (select private.salon_ids()) then
    raise exception 'Venda nao encontrada.' using errcode = '42501';
  end if;

  -- Só gestor estorna: é dinheiro saindo do faturamento do dia.
  if not private.is_manager(v_order.salon_id) then
    raise exception 'Apenas o dono ou o gerente pode estornar uma venda.' using errcode = '42501';
  end if;

  if v_order.status = 'cancelada' then
    raise exception 'Essa venda ja foi estornada.' using errcode = '22023';
  end if;

  select count(*) into v_comissoes_pagas
    from public.commissions c
    join public.order_items oi on oi.id = c.order_item_id
   where oi.order_id = p_order_id and c.pago;
  if v_comissoes_pagas > 0 then
    raise exception 'A comissao deste atendimento ja foi paga no fechamento. Ajuste o acerto com o barbeiro antes de estornar.'
      using errcode = '23514';
  end if;

  -- 1) Estoque: uma entrada para cada produto vendido, com motivo rastreável.
  for v_item in
    select oi.product_id, oi.quantidade
      from public.order_items oi
     where oi.order_id = p_order_id and oi.tipo = 'produto' and oi.product_id is not null
  loop
    insert into public.stock_movements (product_id, tipo, quantidade, motivo)
    values (v_item.product_id, 'entrada', v_item.quantidade,
            'Estorno da venda ' || left(p_order_id::text, 8));
  end loop;

  -- 2) Crédito de pacote consumido nesta venda volta para o cliente.
  delete from public.pacote_consumos pc
   using public.order_items oi
   where pc.order_item_id = oi.id and oi.order_id = p_order_id;

  -- 3) Pacote COMPRADO nesta venda deixa de existir (cascade leva os consumos
  --    dele, se o cliente chegou a usar algum crédito).
  delete from public.pacotes_do_cliente where order_id = p_order_id;

  -- 4) Comissões não pagas somem: o atendimento deixou de ser faturado.
  delete from public.commissions c
   using public.order_items oi
   where c.order_item_id = oi.id and oi.order_id = p_order_id;

  update public.orders set status = 'cancelada' where id = p_order_id;
end;
$$;
revoke all on function public.estornar_venda(uuid) from public, anon;
grant execute on function public.estornar_venda(uuid) to authenticated;
