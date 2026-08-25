-- Aposenta de vez a tabela `plans` (2026-08-25, pacote "admin no modelo por uso").
--
-- Os planos Basico/Pro morreram em 24/08 (0098 desativou; o modelo agora e
-- por agendamento). Mas `plans` ficou zumbi: 6 edge functions ainda liam
-- `preco_unidade` para criar assinaturas -- e o onboarding devolvia 500 se a
-- linha sumisse. Este pacote remove a dependencia das functions e entao:
--
-- - `plan_codigo` vira NULLABLE e perde a FK: assinatura nova nasce sem plano
--   (o valor de verdade e o preco por agendamento, em faixas_de_uso). O texto
--   historico que ja existe nas linhas antigas fica, como registro.
-- - `plano_agendado` e `upgrade_payment_id` caem: eram da troca de plano,
--   fluxo que nao existe mais em tela nenhuma.
-- - `plans` e derrubada.

alter table public.subscriptions
  alter column plan_codigo drop not null,
  drop constraint if exists subscriptions_plan_codigo_fkey,
  drop constraint if exists subscriptions_plano_agendado_fkey;

alter table public.subscriptions
  drop column if exists plano_agendado,
  drop column if exists upgrade_payment_id;

drop table if exists public.plans;
