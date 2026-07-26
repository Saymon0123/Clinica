-- Distingue o que foi criado pelo agente de IA (WhatsApp) do que o dono fez
-- direto no CRM. Alimenta o dashboard da aba Conexão.
alter table appointments
  add column if not exists origem text not null default 'crm'
  check (origem in ('crm', 'agente'));

create index if not exists idx_appointments_salon_origem
  on appointments (salon_id, origem, created_at desc);
