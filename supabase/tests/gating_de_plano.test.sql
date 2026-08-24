-- Quem recebe automação de WhatsApp.
--
-- **A regra mudou em 2026-08-24 com o modelo por uso (0098):** não há mais
-- plano — todo salão ativo e dentro do prazo recebe automação, porque é o uso
-- que cobra. As travas que restam são as que continuam silenciosas quando
-- falham: salão vencido além da carência, suspenso ou sem assinatura receber
-- automação seria dar serviço a quem não pode ter; salão em dia perder seria
-- os lembretes pararem sem ninguém avisar.
--
-- O n8n consome `salons_com_automacao` diretamente; estas asserções são o
-- contrato entre o banco e o fluxo. O salão "Basico" abaixo ficou de
-- propósito: ele prova que o plano deixou de importar.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(6);

\set salao_pro     'dddddddd-0000-0000-0000-000000000001'
\set salao_basico  'dddddddd-0000-0000-0000-000000000002'
\set salao_vencido 'dddddddd-0000-0000-0000-000000000003'
\set salao_inativo 'dddddddd-0000-0000-0000-000000000004'

insert into salons (id, nome, ativo) values
  (:'salao_pro', 'Teste Pro', true),
  (:'salao_basico', 'Teste Basico', true),
  (:'salao_vencido', 'Teste Vencido', true),
  (:'salao_inativo', 'Teste Inativo', false);

insert into subscriptions (salon_id, plan_codigo, status, acesso_ate, atendimento_ate) values
  (:'salao_pro', 'pro', 'ativa', current_date + 30, current_date + 37),
  (:'salao_basico', 'basico', 'ativa', current_date + 30, current_date + 37),
  -- Venceu de verdade: o prazo de carência do WhatsApp também já passou.
  (:'salao_vencido', 'pro', 'atrasada', current_date - 10, current_date - 3),
  (:'salao_inativo', 'pro', 'ativa', current_date + 30, current_date + 37);

select is(
  (select count(*) from salons_com_automacao where id = :'salao_pro')::int, 1,
  'salao Pro em dia recebe automacao'
);

select is(
  (select count(*) from salons_com_automacao where id = :'salao_basico')::int, 1,
  'no modelo por uso o plano nao importa: salao Basico em dia tambem recebe'
);

select is(
  (select count(*) from salons_com_automacao where id = :'salao_vencido')::int, 0,
  'salao Pro vencido alem da carencia perde a automacao'
);

select is(
  (select count(*) from salons_com_automacao where id = :'salao_inativo')::int, 0,
  'salao suspenso nao recebe automacao'
);

-- A carência é a regra decidida em 2026-08-02: vencer bloqueia o CRM, mas o
-- WhatsApp segue atendendo por alguns dias. Sem esta asserção, alguém
-- "simplifica" a view para `acesso_ate` e corta o atendimento no dia do
-- vencimento — exatamente o que a decisão evita.
update subscriptions
   set acesso_ate = current_date - 2, atendimento_ate = current_date + 5
 where salon_id = :'salao_pro';

select is(
  (select count(*) from salons_com_automacao where id = :'salao_pro')::int, 1,
  'vencido mas dentro de atendimento_ate continua recebendo'
);

-- Sem assinatura nenhuma não há plano, e portanto não há direito. O join
-- garante isso; a asserção impede que vire `left join` por engano.
insert into salons (id, nome, ativo)
values ('dddddddd-0000-0000-0000-000000000005', 'Teste Sem Assinatura', true);

select is(
  (select count(*) from salons_com_automacao
    where id = 'dddddddd-0000-0000-0000-000000000005')::int, 0,
  'salao sem assinatura nao recebe automacao'
);

select * from finish();
rollback;
