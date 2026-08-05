-- Diante de dois barbeiros possíveis, o agente marcou com **os dois**: duas
-- linhas para o mesmo cliente, mesmo serviço, mesma hora, criadas com 73ms de
-- diferença. A mensagem citou só um deles, então a segunda cadeira ficou
-- bloqueada para um cliente que não vai aparecer — e ninguém saberia.
--
-- Já existia `appointments_sem_sobreposicao` protegendo o **barbeiro** de ter
-- dois clientes ao mesmo tempo. Faltava o inverso, que é igualmente óbvio: uma
-- pessoa não senta em duas cadeiras na mesma hora.
--
-- Isso não é uma correção "do agente". É um invariante do negócio que estava
-- faltando, e vale também para o CRM, para importação futura e para qualquer
-- automação nova. O agente só foi quem revelou a ausência.
--
-- `client_id` é nulo em bloqueio de agenda, e o EXCLUDE ignora nulos — bloqueios
-- continuam livres para coexistir.

alter table public.appointments
  add constraint appointments_cliente_sem_sobreposicao
  exclude using gist (
    client_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  )
  where (status <> 'cancelado');

comment on constraint appointments_cliente_sem_sobreposicao on public.appointments is
  'Um cliente nao pode ter dois agendamentos sobrepostos. Espelha appointments_sem_sobreposicao, que protege o barbeiro.';
