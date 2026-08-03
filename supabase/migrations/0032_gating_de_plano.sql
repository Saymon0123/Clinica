-- Os planos existiam só como preço: Básico e Pro entregavam exatamente a mesma
-- coisa, então cobrar R$ 299 em vez de R$ 197 não comprava nada. Esta migration
-- faz a diferença valer.
--
-- Pela visão do produto, o que separa os planos e **existe hoje** são as
-- automações de WhatsApp: lembrete de 1h e confirmação de chegada. As outras
-- diferenças (site no Google, recuperação de clientes) ainda não foram
-- construídas, e não há o que travar.
--
-- A trava vai no **dado**, não na lógica do n8n. Um `IF` dentro do fluxo teria
-- de ser repetido em cada automação nova, e um dia alguém esquece — e o esquecer
-- é silencioso: ninguém percebe que um salão Básico recebeu o que não pagou.
-- Uma consulta que só devolve quem tem direito não dá para esquecer.

-- Coluna em vez de comparar com a string 'pro' espalhada pelo sistema: criar um
-- plano novo depois vira uma linha de dado, não uma caçada por literais.
alter table public.plans
  add column if not exists inclui_automacoes boolean not null default false;

update public.plans set inclui_automacoes = true where codigo = 'pro';

comment on column public.plans.inclui_automacoes is
  'Plano dá direito às automações de WhatsApp (lembrete 1h, confirmação de chegada).';

-- Quem pode receber automação, com todas as condições num lugar só.
create or replace view public.salons_com_automacao
with (security_invoker = on) as
select
  s.id,
  s.nome,
  sub.plan_codigo,
  sub.status,
  sub.acesso_ate,
  sub.atendimento_ate
from public.salons s
join public.subscriptions sub on sub.salon_id = s.id
join public.plans p on p.codigo = sub.plan_codigo
where s.ativo
  and p.inclui_automacoes
  -- Vencer não corta o WhatsApp na hora: a regra decidida em 2026-08-02 é que o
  -- CRM bloqueia e o atendimento segue por alguns dias. `atendimento_ate` é essa
  -- carência; sem ela, cai em `acesso_ate`.
  and coalesce(sub.atendimento_ate, sub.acesso_ate) >= current_date;

comment on view public.salons_com_automacao is
  'Salões que podem receber automações de WhatsApp: ativos, em plano que as inclui e dentro do prazo de atendimento. Consumida pelo n8n no lugar de `salons`.';

-- `security_invoker` é essencial aqui. Sem ele a view roda com os direitos de
-- quem a criou e **ignora o RLS** das tabelas de baixo — qualquer usuário
-- logado leria a assinatura de todos os salões. Com ele, o n8n (service_role)
-- segue enxergando tudo e o usuário comum só enxerga o que já podia.
revoke all on public.salons_com_automacao from anon;
grant select on public.salons_com_automacao to authenticated, service_role;
