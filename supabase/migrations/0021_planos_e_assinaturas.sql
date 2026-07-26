-- Planos e assinaturas (checkout via Asaas).
--
-- A cobrança é por unidade. Quando a rede tem mais de uma unidade, cada uma
-- sai pelo preço com desconto — por isso dois preços por plano em vez de um.

create table if not exists plans (
  codigo text primary key check (codigo in ('basico', 'pro')),
  nome text not null,
  descricao text,
  -- Valores em reais, por unidade, por mês.
  preco_unidade numeric(10, 2) not null,
  -- Aplicado quando a rede do salão tem 2+ unidades.
  preco_unidade_rede numeric(10, 2) not null,
  -- Quais recursos o plano libera. Chave ausente ou false = bloqueado.
  recursos jsonb not null default '{}'::jsonb,
  ordem int not null default 0,
  ativo boolean not null default true
);

-- Preços de partida — ajuste com um update, sem precisar de deploy.
insert into plans (codigo, nome, descricao, preco_unidade, preco_unidade_rede, recursos, ordem)
values
  (
    'basico',
    'Básico',
    'Agenda, clientes, catálogo, comanda e financeiro da barbearia.',
    97.00,
    77.00,
    '{"rede": false, "lembretes": false, "recuperacao": false, "site": false}'::jsonb,
    1
  ),
  (
    'pro',
    'Pro',
    'Tudo do Básico, mais rede de unidades, lembretes automáticos, recuperação de clientes e site da barbearia.',
    197.00,
    157.00,
    '{"rede": true, "lembretes": true, "recuperacao": true, "site": true}'::jsonb,
    2
  )
on conflict (codigo) do nothing;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Uma assinatura por unidade.
  salon_id uuid not null unique references salons(id) on delete cascade,
  plan_codigo text not null references plans(codigo),
  -- trial: liberado sem pagar (período de teste ou cortesia)
  -- ativa: pagamento em dia
  -- atrasada: venceu e não foi pago — ainda entra, mas com aviso
  -- cancelada: sem acesso aos recursos do plano
  status text not null default 'trial'
    check (status in ('trial', 'ativa', 'atrasada', 'cancelada')),
  asaas_customer_id text,
  asaas_subscription_id text,
  valor numeric(10, 2),
  proximo_vencimento date,
  -- Até quando o acesso vale mesmo sem pagamento confirmado (trial).
  acesso_ate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_salon_idx on subscriptions (salon_id);
create index if not exists subscriptions_asaas_sub_idx on subscriptions (asaas_subscription_id);

alter table plans enable row level security;
alter table subscriptions enable row level security;

-- Catálogo de planos é público para quem está logado: a tela de assinatura
-- precisa listar as opções antes de existir qualquer assinatura.
drop policy if exists "plans: todos leem" on plans;
create policy "plans: todos leem" on plans
  for select using (ativo);

-- Só o dono enxerga a assinatura da unidade dele. Gerente e barbeiro não
-- têm nada a ver com a cobrança.
drop policy if exists "subscriptions: dono le" on subscriptions;
create policy "subscriptions: dono le" on subscriptions
  for select using (
    exists (
      select 1 from user_salons us
      where us.salon_id = subscriptions.salon_id
        and us.user_id = (select auth.uid())
        and us.role = 'owner'
    )
  );

-- Escrita só pelo service role (Edge Function do checkout e do webhook do
-- Asaas). Sem policy de insert/update/delete, o cliente não grava nada —
-- ninguém marca a própria assinatura como paga.
