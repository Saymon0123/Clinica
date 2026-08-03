-- Troca de plano pelo próprio CRM.
--
-- Duas colunas, porque a troca **não** é instantânea nos dois sentidos e o
-- banco precisa lembrar de uma intenção que ainda não virou realidade:
--
-- - Subir de plano espera o Pix da diferença cair. Quem troca o `plan_codigo` é
--   o webhook, na confirmação — assim ninguém usa o Pro sem ter pago.
-- - Descer de plano só vale na renovação: o dono segue no plano atual até o fim
--   do que já pagou, sem reembolso e sem perder nada.
--
-- Sem guardar isso, o webhook receberia a confirmação e não teria como saber
-- para qual plano ir.

alter table public.subscriptions
  add column if not exists plano_agendado text references public.plans(codigo),
  add column if not exists upgrade_payment_id text;

comment on column public.subscriptions.plano_agendado is
  'Plano para o qual esta assinatura vai mudar. Com upgrade_payment_id, aplica quando aquela cobranca for paga; sem ele, aplica na proxima renovacao.';

comment on column public.subscriptions.upgrade_payment_id is
  'Cobranca avulsa da diferenca proporcional. Existe so entre pedir a subida de plano e o pagamento cair.';

-- O webhook procura a assinatura por esta coluna ao receber a cobrança avulsa.
-- Sem índice seria varredura na tabela a cada evento do Asaas.
create index if not exists subscriptions_upgrade_payment_id_idx
  on public.subscriptions (upgrade_payment_id)
  where upgrade_payment_id is not null;

-- Trocar de plano é decisão de dinheiro: passa pela edge function, que valida
-- papel e fala com o Asaas. Liberar estas colunas ao navegador deixaria o dono
-- se promover para o Pro de graça — o mesmo buraco que a 0030 fechou.
-- (Nada a revogar: a 0030 já restringiu o UPDATE de `authenticated` a
-- `cpf_cnpj`, e colunas novas não entram em grant nenhum sozinhas.)
