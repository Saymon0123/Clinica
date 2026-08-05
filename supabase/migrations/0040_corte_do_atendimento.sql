-- Até aqui, vencer não cortava nada no WhatsApp: o CRM bloqueava e o agente
-- seguia atendendo para sempre. Faltava o outro lado da regra.
--
-- Decisão de 2026-08-05: **3 dias** de tolerância depois do vencimento (eram 7).
-- Passado esse prazo, o agente para de responder.
--
-- A trava vive numa view, como a `salons_com_automacao`: o fluxo do n8n troca a
-- tabela pela view e ganha o corte, sem `IF` novo para alguém esquecer de
-- repetir na próxima automação.
--
-- Barbearia **sem linha de assinatura continua sendo atendida**. Isso é
-- deliberado: a ausência da linha é falha nossa de cadastro, não inadimplência
-- do cliente. Cortar o atendimento de quem está em dia porque o nosso wizard
-- não gravou a assinatura seria punir o cliente pelo nosso defeito — e de forma
-- silenciosa, que é o pior jeito.

create or replace view public.salons_atendendo
with (security_invoker = on) as
select s.*
from public.salons s
left join public.subscriptions sub on sub.salon_id = s.id
where s.ativo
  and (
    sub.salon_id is null
    -- `atendimento_ate` é gravado pelo webhook na confirmação do pagamento.
    -- Em teste ele é nulo, e aí o prazo sai de `acesso_ate` + a tolerância.
    or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date
  );

comment on view public.salons_atendendo is
  'Saloes cujo agente ainda deve responder: ativos e dentro do prazo de tolerancia (3 dias apos o vencimento). Sem assinatura registrada, atende -- a falta da linha e problema nosso, nao inadimplencia.';

revoke all on public.salons_atendendo from anon;
grant select on public.salons_atendendo to authenticated, service_role;
