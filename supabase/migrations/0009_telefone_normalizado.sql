-- Casamento de telefone em qualquer formato.
--
-- Problema: o WhatsApp entrega o número como "554187275895" (com DDI 55 e,
-- em números antigos, sem o 9), enquanto o CRM guarda o que o barbeiro
-- digitou: "(41) 98727-5895", "41987275895", etc. A busca por igualdade
-- nunca casava, então o agente de IA nunca encontrava o cliente já
-- cadastrado e acabava criando um novo.
--
-- Solução: os últimos 8 dígitos são sempre iguais em todos esses formatos.

alter table clients
  add column if not exists telefone_norm text
  generated always as (
    nullif(right(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 8), '')
  ) stored;

create index if not exists idx_clients_salon_telefone_norm
  on clients (salon_id, telefone_norm);

-- Impede o mesmo telefone duas vezes no mesmo salão, independente do
-- formato digitado. Clientes sem telefone (null) não são afetados.
create unique index if not exists uq_clients_salon_telefone_norm
  on clients (salon_id, telefone_norm)
  where telefone_norm is not null;
