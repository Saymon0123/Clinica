-- Os planos nunca foram semeados por migration.
--
-- `basico` e `pro` existem em produção porque foram inseridos à mão. Um banco
-- criado do zero a partir deste repositório nasce com `plans` **vazia** — e aí
-- qualquer `subscriptions` viola `subscriptions_plan_codigo_fkey`.
--
-- Foi o que deixou o pgTAP vermelho: ele constrói um banco limpo a cada
-- execução, e `gating_de_plano.test.sql` insere assinatura no plano `pro`.
--
-- Quinta forma de divergência entre repositório e produção neste projeto —
-- depois de tabela ausente (`0022`), tabela a mais (`0024`), permissões
-- ausentes (`0023`) e função publicada mais nova que o arquivo (`accept-invite`).
-- Todas com a mesma raiz: mudança aplicada direto no ambiente.
--
-- Valores copiados de produção em 2026-08-16, para o banco novo nascer igual.
--
-- **Idempotente de propósito:** `on conflict do nothing` deixa produção
-- intacta, onde as linhas já existem. Não usa `do update` porque preço é
-- decisão comercial: se alguém mudar a tabela pelo painel, reaplicar a
-- migration não pode desfazer.

insert into public.plans
  (codigo, nome, descricao, preco_unidade, preco_unidade_rede, recursos, ordem, ativo, inclui_automacoes)
values
  (
    'basico',
    'Básico',
    'Agenda, clientes, catálogo, comanda e financeiro da barbearia.',
    197.00,
    77.00,
    '{"rede": false, "site": false, "lembretes": false, "recuperacao": false}'::jsonb,
    1,
    true,
    false
  ),
  (
    'pro',
    'Pro',
    'Tudo do Básico, mais rede de unidades, lembretes automáticos, recuperação de clientes e site da barbearia.',
    299.00,
    157.00,
    '{"rede": true, "site": true, "lembretes": true, "recuperacao": true}'::jsonb,
    2,
    true,
    true
  )
on conflict (codigo) do nothing;
