-- `appointments` não guarda **quando** foi alterado, só quando foi criado.
--
-- Isso impede a checagem mais importante da auditoria: o agente disse "pronto,
-- cancelei seu horário" e de fato cancelou? Sem a hora da alteração não há como
-- cruzar a frase com o efeito — e foi exatamente esse o defeito de 2026-08-05,
-- em que ele anunciou um cancelamento que não aconteceu.
--
-- Reaproveita `marca_updated_at`, o mesmo trigger de `subscriptions` e
-- `whatsapp_connections` (migration 0031).

alter table public.appointments
  add column if not exists updated_at timestamptz not null default now();

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.marca_updated_at();

comment on column public.appointments.updated_at is
  'Ultima alteracao. Usada pela auditoria para cruzar o que o agente disse com o que de fato mudou.';
