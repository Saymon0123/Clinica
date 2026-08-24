-- Cobranca unificada da rede: um boleto para todas as unidades.
--
-- **A cobranca continua nascendo por unidade.** Cada `subscriptions` segue
-- sendo a verdade sobre plano, valor e acesso da sua unidade -- e e nela que o
-- modelo de preco novo (ainda por definir) vai mexer. O que a rede escolhe e
-- so o formato do BOLETO: um por unidade (padrao, como sempre foi) ou um unico
-- com a soma de todas.
--
-- Quando unificada, a recorrencia por unidade no Asaas e cancelada e nasce UMA
-- recorrencia da rede, no valor da soma. O webhook, ao receber o pagamento
-- dela, estende o acesso de TODAS as unidades de uma vez. Separar de novo
-- cancela a recorrencia da rede e cada unidade volta a assinar sozinha.

alter table public.organizations
  add column if not exists cobranca_unificada boolean not null default false,
  add column if not exists cpf_cnpj text,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text;

comment on column public.organizations.cobranca_unificada is
  'A rede paga num boleto so. As subscriptions por unidade continuam sendo a verdade de plano/valor/acesso; o que muda e que a recorrencia no Asaas e uma, da rede, no valor da soma -- e o webhook estende todas as unidades quando ela e paga.';
comment on column public.organizations.cpf_cnpj is
  'Documento do pagante da rede. Separado do cpf_cnpj por unidade: a rede costuma pagar pelo CNPJ da matriz ou da holding, nao pelo documento de cada loja.';
comment on column public.organizations.asaas_customer_id is
  'Cliente da rede no Asaas. Um por rede, reaproveitado -- criar de novo a cada tentativa duplicaria o cadastro la.';
comment on column public.organizations.asaas_subscription_id is
  'Recorrencia unica da rede no Asaas, no valor da soma das unidades. Preenchida = cobranca unificada ativa de verdade (a flag diz a intencao; isto diz o estado no Asaas).';

-- O dono da rede liga e desliga a unificacao pelo CRM -- mas quem ESCREVE e a
-- edge function com service_role, depois de validar que quem pediu e dono de
-- todas as unidades. Nenhuma policy de escrita para authenticated, de
-- proposito: um update direto do front poderia ligar a flag sem cancelar as
-- recorrencias por unidade no Asaas, e a rede pagaria em dobro.
