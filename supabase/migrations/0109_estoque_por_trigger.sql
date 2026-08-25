-- Estoque passa a ser aplicado por trigger (2026-08-25, pacote "venda robusta").
--
-- Antes, quem mexia em products.estoque_atual era o CRM, com o valor lido no
-- carregamento da tela -- duas vendas simultaneas se sobrescreviam, e a
-- reposicao em dois passos podia gravar o movimento sem atualizar o saldo.
--
-- Agora o CRM so INSERE o movimento; o saldo e consequencia:
--   INSERT entrada -> soma; INSERT saida -> subtrai (nunca abaixo de zero);
--   DELETE -> desfaz o efeito. O DELETE reverso e o que permite ao fluxo de
--   venda desfazer TUDO num erro: apagar a comanda (cascade leva itens,
--   pagamento, comissao e resgate) + apagar os movimentos = estoque restaurado.
--
-- SECURITY DEFINER: o barbeiro pode inserir movimento (a venda dele da baixa),
-- mas nao pode dar update em products -- o trigger faz por ele.

create or replace function public.aplica_movimento_de_estoque()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_delta := case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end;
    update public.products
       set estoque_atual = greatest(0, estoque_atual + v_delta)
     where id = new.product_id;
    return new;
  else
    v_delta := case when old.tipo = 'entrada' then -old.quantidade else old.quantidade end;
    update public.products
       set estoque_atual = greatest(0, estoque_atual + v_delta)
     where id = old.product_id;
    return old;
  end if;
end;
$$;

revoke execute on function public.aplica_movimento_de_estoque() from public, anon, authenticated;

drop trigger if exists trg_aplica_movimento_de_estoque on public.stock_movements;
create trigger trg_aplica_movimento_de_estoque
  after insert or delete on public.stock_movements
  for each row execute function public.aplica_movimento_de_estoque();
