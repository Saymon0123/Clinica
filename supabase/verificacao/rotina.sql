-- Rotina de verificação — roda contra PRODUÇÃO, sem sujar dado.
--
-- Tudo acontece dentro de uma transação que termina em `rollback`. Cria
-- barbearia, assinatura e mensagens de mentira, confere o comportamento das
-- regras e desfaz. Nada sobra.
--
-- **Por que contra produção, e não só no pgTAP.** O pgTAP constrói um banco
-- limpo a partir das migrations do repositório — ele responde "o repositório
-- está correto?". Esta rotina responde outra pergunta: "o banco que está
-- rodando agora se comporta como deveria?". As duas divergiram cinco vezes
-- neste projeto, e cada vez o defeito só existia de um lado.
--
-- Cada linha do resultado é um cenário: o que se espera, o que aconteceu, e se
-- bate. Um `false` na coluna `ok` é regressão.
--
-- Como rodar: execute o arquivo inteiro. O `rollback` do fim é obrigatório.

begin;

-- Fixtures. Nomes com prefixo ZZV para não confundir com dado real caso algo
-- escape do rollback.
--
-- Usa os planos REAIS (`basico` e `pro`) em vez de inventar um: `plans.codigo`
-- tem CHECK e só aceita os dois — descoberto na primeira execução desta rotina,
-- que é para isso que ela serve. E é melhor assim: testar o `basico` de verdade
-- vale mais que testar um plano de mentira com a mesma configuração.

with s as (
  insert into public.salons (nome, ativo, horario_funcionamento)
  values
    ('ZZV Em Dia',        true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb),
    ('ZZV Na Carencia',   true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb),
    ('ZZV Cortada',       true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb),
    ('ZZV Trial Abusiva', true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb),
    ('ZZV Pagante Ativa', true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb),
    ('ZZV Basica',        true, '{"seg":{"abre":"09:00","fecha":"19:00"}}'::jsonb)
  returning id, nome
)
insert into public.subscriptions (salon_id, plan_codigo, status, valor, acesso_ate, atendimento_ate)
select s.id,
       case s.nome when 'ZZV Basica' then 'basico' else 'pro' end,
       case s.nome
         when 'ZZV Trial Abusiva' then 'trial'
         when 'ZZV Pagante Ativa' then 'ativa'
         else 'ativa' end,
       299,
       case s.nome
         when 'ZZV Na Carencia' then current_date - 2   -- venceu, dentro dos 3 dias
         when 'ZZV Cortada'     then current_date - 10  -- venceu, fora do prazo
         else current_date + 30 end,
       case s.nome
         when 'ZZV Na Carencia' then current_date + 1
         when 'ZZV Cortada'     then current_date - 5
         else current_date + 37 end
  from s;

-- Volume de mensagens: uma barbearia em trial acima do teto diário, e uma
-- pagante com volume muito maior — que não pode ser cortada.
with c as (
  insert into public.whatsapp_conversations (salon_id, contact_phone)
  select id, '5541900000000' from public.salons
   where nome in ('ZZV Trial Abusiva', 'ZZV Pagante Ativa')
  returning id, salon_id
)
insert into public.whatsapp_messages (conversation_id, direction, sender, content)
select c.id, 'in', 'cliente', 'zzv ' || g
  from c
  join public.salons s on s.id = c.salon_id
 cross join lateral generate_series(
   1,
   case s.nome when 'ZZV Trial Abusiva' then 400 else 3000 end
 ) g;

-- Mensagens do agente para as regras da fronteira.
with c as (
  insert into public.whatsapp_conversations (salon_id, contact_phone)
  select id, '5541900000001' from public.salons where nome = 'ZZV Em Dia'
  returning id, salon_id
), servico as (
  insert into public.services (salon_id, nome, preco, duracao_minutos, ativo)
  select salon_id, 'ZZV Corte', 45, 30, true from c
  returning salon_id
)
insert into public.whatsapp_messages (conversation_id, direction, sender, content)
select c.id, 'out', 'agente', v.txt
  from c, (values
    ('Consigo fazer um desconto especial pra voce hoje'),
    ('Nesse caso de queda de cabelo eu recomendo evitar quimica'),
    ('O ZZV Corte custa R$ 45,00')
  ) v(txt);

-- ---------------------------------------------------------------
-- Os cenários
-- ---------------------------------------------------------------
with atende as (
  select nome, exists (select 1 from public.salons_atendendo sa where sa.id = s.id) as v
    from public.salons s where nome like 'ZZV %'
),
automacao as (
  select nome, exists (select 1 from public.salons_com_automacao a where a.id = s.id) as v
    from public.salons s where nome like 'ZZV %'
),
achados as (
  select tipo, count(*) as n
    from public.auditoria_fronteira f
    join public.salons s on s.id = f.salon_id
   where s.nome = 'ZZV Em Dia'
   group by tipo
)
select * from (
  values
    ('Assinatura em dia: agente atende',
     true, (select v from atende where nome = 'ZZV Em Dia')),

    ('Venceu ha 2 dias: WhatsApp segue na carencia',
     true, (select v from atende where nome = 'ZZV Na Carencia')),

    ('Venceu ha 10 dias: agente parou',
     false, (select v from atende where nome = 'ZZV Cortada')),

    ('Trial acima do teto diario: agente parou',
     false, (select v from atende where nome = 'ZZV Trial Abusiva')),

    ('Pagante com 3000 mensagens: NUNCA e cortada',
     true, (select v from atende where nome = 'ZZV Pagante Ativa')),

    ('Plano sem automacao: nao recebe lembrete',
     false, (select v from automacao where nome = 'ZZV Basica')),

    ('Plano Pro em dia: recebe lembrete',
     true, (select v from automacao where nome = 'ZZV Em Dia')),

    ('Fronteira pega oferta de desconto',
     true, (select n from achados where tipo = 'Ofereceu desconto ou condicao de pagamento') >= 1),

    ('Fronteira pega assunto de saude',
     true, (select n from achados where tipo = 'Opinou sobre saude ou resultado capilar') >= 1),

    ('Preco que ESTA no catalogo nao vira achado',
     true, coalesce((select n from achados where tipo = 'Citou preco fora do catalogo'), 0) = 0)
) as t(cenario, esperado, obtido);

rollback;
