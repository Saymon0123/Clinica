-- Segunda reincidência do horário em UTC chegando ao cliente.
--
-- A `0036` deu `data_local` e `hora_local` à listagem, e o agente passou a ler
-- certo de lá. Mas `Cancelar Agendamento` escreve direto em `appointments` e o
-- PostgREST devolve a linha crua, com `data_hora_inicio` em UTC. O agente usou
-- o retorno mais recente — o do cancelamento — e anunciou "17:30" para um
-- horário das 14:30, mesmo tendo lido "14:30" um segundo antes.
--
-- Enquanto existir uma fonte com o horário errado ao alcance, uma hora ele lê
-- dela. A correção é não deixar UTC ao alcance: esta view é sobre uma tabela
-- só, sem junção, então continua **atualizável** — dá para gravar `status` por
-- ela — e toda resposta já sai com o horário local junto.
--
-- Regra que este caso deixa clara: quando o modelo escolhe entre duas fontes e
-- uma delas está errada, o conserto não é instruir a escolha. É remover a
-- fonte errada.

create or replace view public.agendamento_local
with (security_invoker = on) as
select
  a.id,
  a.salon_id,
  a.client_id,
  a.professional_id,
  a.service_id,
  a.status,
  a.data_hora_inicio,
  a.data_hora_fim,
  a.origem,
  a.lembrete_enviado,
  a.confirmacao_enviada,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data_local,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_local
from public.appointments a;

comment on view public.agendamento_local is
  'appointments com data_local e hora_local em texto (fuso de Brasilia). Atualizavel: o agente cancela por aqui e recebe de volta o horario ja no fuso certo.';

revoke all on public.agendamento_local from anon;
grant select, update on public.agendamento_local to authenticated, service_role;
