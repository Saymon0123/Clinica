-- 0137: estoque com uma porta só (Parte 4, passo 4.4).
--
-- Três caminhos de entrada: o cadastro gravava `estoque_atual` direto na linha
-- (sem movimento), "Repor" inseria movimento (o trigger da 0109 aplica), e a
-- edição fazia um movimento pelo DELTA contra o número lido na abertura do
-- modal — reintroduzindo a corrida que a 0109 tinha resolvido. A soma dos
-- movimentos nunca fechava com o saldo.
--
-- Agora TODA entrada é movimento e o saldo é consequência. `authenticated`
-- perde o direito de escrever `estoque_atual` (grant por coluna, como a 0128
-- fez em salon_invites); quem escreve é o trigger, SECURITY DEFINER desde a
-- 0109. O PostgREST devolve 42501 a qualquer insert/update da tela que
-- mencione a coluna.

-- 1. Acerta o passado: um movimento de ajuste para cada produto cujo saldo
--    não bate com a soma dos movimentos. Trigger desligado nesse trecho para
--    o ajuste não ser aplicado duas vezes (o saldo já está certo; é a soma
--    que estava atrasada).
alter table public.stock_movements disable trigger trg_aplica_movimento_de_estoque;

insert into public.stock_movements (product_id, tipo, quantidade, motivo)
select p.id,
       case when d.delta > 0 then 'entrada' else 'saida' end,
       abs(d.delta),
       'ajuste inicial (0137): estoque cadastrado sem movimento'
  from public.products p
  join lateral (
    select p.estoque_atual
         - coalesce(sum(case when m.tipo = 'entrada' then m.quantidade else -m.quantidade end), 0) as delta
      from public.stock_movements m
     where m.product_id = p.id
  ) d on true
 where d.delta <> 0;

alter table public.stock_movements enable trigger trg_aplica_movimento_de_estoque;

-- 2. A porta única.
revoke insert, update on public.products from authenticated;
grant insert (salon_id, nome, preco_custo, preco_venda, estoque_minimo, ativo)
  on public.products to authenticated;
grant update (nome, preco_custo, preco_venda, estoque_minimo, ativo, estoque_baixo_avisado_em)
  on public.products to authenticated;

-- 3. A conferência: saldo, soma dos movimentos e a diferença (que agora é
--    sempre zero — e o teste cobra isso).
drop view if exists public.estoque_conferido;
create view public.estoque_conferido
with (security_invoker = on) as
select p.id as product_id,
       p.salon_id,
       p.nome,
       p.estoque_atual,
       coalesce(sum(case when m.tipo = 'entrada' then m.quantidade else -m.quantidade end), 0) as soma_movimentos,
       p.estoque_atual
         - coalesce(sum(case when m.tipo = 'entrada' then m.quantidade else -m.quantidade end), 0) as diferenca
  from public.products p
  left join public.stock_movements m on m.product_id = p.id
 group by p.id;

comment on view public.estoque_conferido is
  'Saldo x soma dos movimentos por produto. diferenca deve ser sempre 0 desde a 0137: toda entrada de estoque e um movimento.';

grant select on public.estoque_conferido to authenticated;
revoke all on public.estoque_conferido from anon;
