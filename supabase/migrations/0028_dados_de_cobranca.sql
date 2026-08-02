-- Dados necessários para cobrar pelo CRM (Asaas).
--
-- O Asaas exige **CPF ou CNPJ do pagante** para criar um cliente — sem isso não
-- existe assinatura. O projeto não coletava esse dado em lugar nenhum:
-- `organizations.cnpj` só existe para rede, e a v1 trata unidade única.
--
-- Fica em `subscriptions`, e não em `salons`, porque é dado de **cobrança**: diz
-- respeito a quem paga a plataforma, não à barbearia que atende clientes. Um dia
-- o pagante pode ser uma pessoa jurídica diferente do salão.
--
-- Decidido em 2026-08-02: o documento é pedido **na tela de Assinatura**, no
-- momento em que o dono decide pagar — e não no cadastro. Pedir documento antes
-- de existir intenção de pagar atrasa o onboarding e é quando a pessoa mais
-- resiste a informar.
alter table subscriptions
  add column if not exists cpf_cnpj text;

comment on column subscriptions.cpf_cnpj is
  'CPF ou CNPJ de quem paga a plataforma. Exigido pelo Asaas para criar o cliente. Guardado so em digitos.';

-- Até quando o WhatsApp continua atendendo depois de o acesso ao CRM vencer.
--
-- Decisão de produto de 2026-08-02: vencer **não** derruba o atendimento na
-- hora. Cortar o agente para o negócio do cliente e vira reclamação, não
-- pagamento — o CRM bloqueia, mas os clientes da barbearia continuam sendo
-- atendidos por alguns dias.
--
-- Data explícita, e não um "+7 dias" calculado no código, para o prazo poder ser
-- esticado caso a caso sem redeploy — negociar prazo com quem está atrasado é
-- rotina comercial, não exceção.
alter table subscriptions
  add column if not exists atendimento_ate date;

comment on column subscriptions.atendimento_ate is
  'Ate quando o agente do WhatsApp segue atendendo apos o vencimento do acesso ao CRM. Nulo = sem corte automatico.';
