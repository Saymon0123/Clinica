-- Registro dos eventos já processados do Asaas.
--
-- A documentação do Asaas é explícita: a entrega é **"at least once"** — o
-- mesmo evento pode chegar mais de uma vez. Sem esta tabela, um
-- `PAYMENT_CONFIRMED` reentregue empurraria o vencimento de novo e daria dois
-- meses de acesso para quem pagou um.
--
-- A chave primária é o próprio `id` do evento no Asaas: o insert falha por
-- duplicidade na segunda vez, e é essa falha que o webhook usa como sinal de
-- "já tratei isso".
--
-- Serve também de trilha de auditoria: quando um cliente disser que pagou e o
-- acesso não abriu, é aqui que se vê se o evento chegou.
create table if not exists asaas_eventos (
  id text primary key,
  evento text not null,
  payment_id text,
  subscription_id text,
  recebido_em timestamptz not null default now(),
  payload jsonb
);

create index if not exists idx_asaas_eventos_subscription
  on asaas_eventos (subscription_id, recebido_em desc);

-- Ninguém acessa isto pelo CRM: quem escreve é a edge function do webhook, com
-- service role, que ignora RLS. Habilitar sem política nenhuma é o que garante
-- que a tabela não vaze pela API pública — nem para usuário autenticado.
alter table asaas_eventos enable row level security;

comment on table asaas_eventos is
  'Eventos ja processados do Asaas. Existe para garantir idempotencia: a entrega do Asaas e at-least-once.';
