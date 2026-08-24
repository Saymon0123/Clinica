-- Fim dos planos Basico/Pro: no modelo por uso, todo mundo tem tudo.
--
-- O gating por plano existia para diferenciar mensalidades. Com a cobranca por
-- agendamento (0097), a diferenca de preco ja acontece no uso -- segurar o
-- lembrete de quem esta no "Basico" so faria o produto trazer menos
-- agendamentos, que e exatamente o que passa a ser cobrado.
--
-- `plans` e `subscriptions` NAO caem: subscriptions guarda `acesso_ate` e
-- `atendimento_ate`, que continuam sendo o relogio do bloqueio (o webhook os
-- estende quando o boleto manual e pago). `plan_codigo` vira vestigio
-- historico, mantido pela FK.

update public.plans set ativo = false;

comment on table public.plans is
  'APOSENTADA em 2026-08-24: o modelo passou a ser cobranca por uso (faixas_de_uso). As linhas ficam pelo historico e pela FK de subscriptions.plan_codigo; nada novo deve nascer daqui.';

-- salons_com_automacao perde o filtro de plano. Continua exigindo barbearia
-- ativa e dentro do prazo de atendimento -- inadimplente segue cortado.
-- A lista de colunas nao muda (o n8n le por nome), entao create or replace
-- basta, sem drop.
create or replace view public.salons_com_automacao as
 select s.id,
    s.nome,
    sub.plan_codigo,
    sub.status,
    sub.acesso_ate,
    sub.atendimento_ate
   from public.salons s
   join public.subscriptions sub on sub.salon_id = s.id
  where s.ativo
    and coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date;

comment on view public.salons_com_automacao is
  'Barbearias que recebem automacoes (lembrete, reativacao, atraso). Desde 2026-08-24 nao filtra mais por plano: no modelo por uso todo mundo tem tudo, e a trava que resta e estar ativa e dentro do prazo de atendimento.';
