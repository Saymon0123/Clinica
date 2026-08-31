-- 0119: o agente lê os dados do salão por salons_atendendo; para mandar o
-- link de avaliação quando a nota é 5 (item 16), a view precisa expor
-- google_review_url. Coluna nova NO FIM da lista — replace sem drop é seguro
-- aqui (42P16 só quando muda coluna no meio) — e a cláusula do invoker é
-- repetida porque create or replace sem ela derruba o invoker (lição da 0098).
create or replace view public.salons_atendendo
with (security_invoker = on) as
select s.id,
       s.nome,
       s.endereco,
       s.telefone,
       s.horario_funcionamento,
       s.created_at,
       s.meta_faturamento_mensal,
       s.organization_id,
       s.ativo,
       s.google_review_url
  from public.salons s
  left join public.subscriptions sub on sub.salon_id = s.id
 where s.ativo
   and (sub.salon_id is null or coalesce(sub.atendimento_ate, sub.acesso_ate + 3) >= current_date)
   and (sub.status is distinct from 'trial'
        or not exists (
          select 1 from public.uso_do_agente u
           where u.salon_id = s.id
             and (u.recebidas_no_total >= 2000 or u.recebidas_hoje >= 400)));
