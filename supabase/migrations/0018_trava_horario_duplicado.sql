-- Impede dois agendamentos sobrepostos para o mesmo profissional.
-- Vale para o CRM e para o agente de IA (n8n), já que a trava é do banco.

-- 1. Resolve conflitos preexistentes deslocando o agendamento ainda pendente
--    (o concluído é histórico e não deve ser alterado).
with conflitos as (
  select a.id,
         row_number() over (partition by a.professional_id, a.data_hora_inicio
                            order by case when a.status = 'concluido' then 0 else 1 end, a.created_at) as ordem,
         a.data_hora_fim - a.data_hora_inicio as duracao
  from appointments a
  where a.status not in ('cancelado')
    and exists (
      select 1 from appointments b
      where b.professional_id = a.professional_id and b.id <> a.id
        and b.status not in ('cancelado')
        and tstzrange(a.data_hora_inicio, a.data_hora_fim) && tstzrange(b.data_hora_inicio, b.data_hora_fim)
    )
)
update appointments a
set data_hora_inicio = a.data_hora_inicio + (c.ordem - 1) * c.duracao,
    data_hora_fim    = a.data_hora_fim    + (c.ordem - 1) * c.duracao
from conflitos c
where a.id = c.id and c.ordem > 1;

-- 2. Restrição de exclusão: mesmo profissional não pode ter dois períodos
--    que se sobrepõem. Cancelados ficam de fora.
create extension if not exists btree_gist;

alter table appointments
  add constraint appointments_sem_sobreposicao
  exclude using gist (
    professional_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  )
  where (status <> 'cancelado');
