-- Unicidade de whatsapp_connections.instance_name.
--
-- A PK da tabela é salon_id, então nada impedia duas linhas apontarem para o
-- mesmo instance_name. O fluxo do n8n resolve o tenant justamente por esse
-- campo (`Buscar Instância Conectada` → getAll ... limit 1): com duas linhas
-- casando, ele escolheria um salão arbitrário e — usando service_role, que
-- ignora RLS — gravaria conversas e agendamentos no salão errado, sem erro.
--
-- Verificado antes de escrever esta migration: 2 linhas em produção, ambas no
-- padrão `salon-<salon_id>`, nenhuma duplicata.

alter table whatsapp_connections
  add constraint whatsapp_connections_instance_name_key unique (instance_name);
