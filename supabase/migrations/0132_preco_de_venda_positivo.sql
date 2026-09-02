-- 0132: nada sai a R$ 0,00 por acidente (Parte 2, passo 2.4 — achado 14).
--
-- `products.preco_venda` aceitava nulo e zero. No caixa, o item entra com o
-- preço do catálogo (`preco_unitario: opt.preco`): produto sem preço virava
-- linha a R$ 0,00 na comanda, e a comanda fechava assim — sem aviso, sem
-- comissão, sem faturamento. O barbeiro só via na conferência do fim do dia,
-- quando já não lembrava qual cliente levou o produto.
--
-- A trava vai na FONTE do zero acidental. No caixa, o único R$ 0,00 legítimo é
-- o consumo de pacote (o cliente já pagou antes), e essa regra fica no CRM:
-- o item da comanda e o consumo do pacote são gravados em pedidos separados,
-- então o banco não tem como saber, na hora do insert do item, se um consumo
-- vem logo atrás. Trancar `order_items` aqui recusaria o pacote legítimo.
--
-- Serviço entra junto, embora o achado cite produto: `services.preco` tinha o
-- mesmo buraco (`>= 0` na tela, nada no banco), e com o caixa passando a
-- recusar item a R$ 0,00 um serviço gravado a zero viraria um serviço que não
-- se consegue vender — pior do que ser recusado no cadastro, com explicação.
-- Hoje nenhum produto existe e nenhum serviço está a zero: entra validada.

-- NOT NULL e CHECK separados de propósito: um dá 23502 ("faltou preencher um
-- campo obrigatório"), o outro 23514 com o nome da regra — o tradutor de erro
-- do CRM já fala as duas línguas.
alter table public.products alter column preco_venda set not null;

alter table public.products drop constraint if exists products_preco_de_venda_positivo;
alter table public.products
  add constraint products_preco_de_venda_positivo check (preco_venda > 0);

comment on constraint products_preco_de_venda_positivo on public.products is
  'Produto sem preco de venda virava item a R$ 0,00 na comanda, fechada sem aviso. O unico zero legitimo no caixa e o consumo de pacote, e esse nao vem do catalogo.';

alter table public.services drop constraint if exists services_preco_positivo;
alter table public.services
  add constraint services_preco_positivo check (preco > 0);

comment on constraint services_preco_positivo on public.services is
  'Mesma regra do produto: servico a R$ 0,00 no catalogo viraria item que o caixa recusa. Cortesia se resolve com pacote ou desconto na comanda, nao com preco zero no catalogo.';
