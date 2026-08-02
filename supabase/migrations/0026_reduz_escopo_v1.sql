-- REDUÇÃO AO ESCOPO DA V1 (2026-08-02)
--
-- O projeto tinha passado da v1 em largura sem fechá-la: Marketing (item 3 da
-- v3) foi construído inteiro, e Pacotes (item 1 da v3) existia como schema sem
-- nenhuma tela. Schema sem produto não gera receita e envelhece — quando alguém
-- for usar, a modelagem já não corresponde ao que se aprendeu no meio tempo.
--
-- Esta migration remove o que não é v1, para que ao terminá-la o projeto entre
-- na v2 alinhado com o roteiro em docs/mercado-e-roadmap.md.
--
-- MANTIDOS de propósito, apesar de não serem v1:
--   * `plans` e `subscriptions` — a integração com o Asaas está sendo estudada,
--     e as tabelas vazias não custam nada
--   * rede multi-unidade (`organizations`, `user_salons`) — virou a fundação do
--     RLS; `private.salon_ids()` e `private.is_manager()` dependem dela, então
--     remover seria reescrever o modelo de permissão inteiro
--
-- Sem perda de dado: as tabelas de pacote estavam todas vazias, e nenhuma linha
-- de `order_items` usava `package_id` ou `client_package_id`. O desenho da aba
-- Marketing está preservado em docs/marketing.md, e o código no histórico do git.

-- 1. Marketing (v3) ----------------------------------------------------------

drop function if exists marketing_segmentos(uuid);
drop function if exists marketing_segmento_clientes(uuid, text, int);
drop function if exists marketing_horarios_ociosos(uuid, int);
drop function if exists marketing_comissao_media(uuid);
drop function if exists private.fuso_do_salao(uuid);

drop table if exists client_marketing;

-- 2. Pacotes de crédito (v3) -------------------------------------------------
--
-- A view sai primeiro: além de depender das tabelas, ela é o único advisor de
-- nível ERROR do projeto (SECURITY DEFINER exposta via PostgREST, permitindo ler
-- saldo de pacote de qualquer salão com a chave anon). Removê-la resolve o
-- achado que estava no backlog desde 2026-07-29.
drop view if exists client_package_saldo;

-- `order_items` é tabela central da comanda, e é o único ponto onde esta
-- remoção encosta em algo da v1. As duas colunas ficam órfãs sem as tabelas de
-- pacote, e o tipo 'pacote' passa a ser inalcançável.
alter table order_items drop column if exists client_package_id;
alter table order_items drop column if exists package_id;

alter table order_items drop constraint if exists order_items_tipo_check;
alter table order_items add constraint order_items_tipo_check
  check (tipo in ('servico', 'produto'));

-- Ordem ditada pelas chaves estrangeiras: das folhas para a raiz.
drop table if exists package_usages;
drop table if exists client_package_credits;
drop table if exists client_packages;
drop table if exists package_items;
drop table if exists packages;
