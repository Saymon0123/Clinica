-- Adiantar quem está esperando.
--
-- O cliente das 10:30 não apareceu; o das 11:00 está de pé na barbearia. O
-- barbeiro quer atender quem chegou. **Trocar os dois de lugar** atende os dois
-- lados: quem está ali corta antes, quem atrasou corta no horário seguinte, e
-- ninguém é cancelado.
--
-- Isso era impossível até aqui. A operação é **válida no fim e inválida no
-- meio**: durante a troca, os dois ocupam o mesmo horário por um instante, e a
-- trava de sobreposição recusava.
--
-- `DEFERRABLE INITIALLY IMMEDIATE` resolve sem afrouxar nada. No uso normal a
-- checagem continua imediata — agendamento sobreposto é recusado na hora, com a
-- mesma mensagem. Só dentro de uma transação que **pede** o adiamento o banco
-- passa a conferir no commit, quando o arranjo já faz sentido.

alter table public.appointments
  drop constraint if exists appointments_sem_sobreposicao;
alter table public.appointments
  drop constraint if exists appointments_cliente_sem_sobreposicao;

-- `faltou` entra junto: quem não apareceu não pode continuar bloqueando o
-- horário, e cancelar apagaria a informação de que houve falta — que é
-- justamente o número que interessa ao dono.
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('agendado', 'confirmado', 'concluido', 'cancelado', 'bloqueio', 'faltou'));

alter table public.appointments
  add constraint appointments_sem_sobreposicao
  exclude using gist (
    professional_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  ) where (status not in ('cancelado', 'faltou'))
  deferrable initially immediate;

alter table public.appointments
  add constraint appointments_cliente_sem_sobreposicao
  exclude using gist (
    client_id with =,
    tstzrange(data_hora_inicio, data_hora_fim) with &&
  ) where (status not in ('cancelado', 'faltou'))
  deferrable initially immediate;

comment on column public.appointments.status is
  'agendado, confirmado, concluido, cancelado, bloqueio ou faltou. `faltou` e `cancelado` nao ocupam horario.';

-- Troca dois agendamentos de horário.
--
-- **Não valida se cabe.** Quem valida é a trava, no commit. Se o resultado
-- atropelar quem vem depois, a transação inteira é recusada e a tela explica.
-- Repetir a regra aqui seria uma segunda fonte de verdade para divergir.
create or replace function public.trocar_horarios(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio_a timestamptz;
  v_inicio_b timestamptz;
  v_salon_a uuid;
  v_salon_b uuid;
begin
  select data_hora_inicio, salon_id into v_inicio_a, v_salon_a
    from public.appointments where id = p_a for update;
  select data_hora_inicio, salon_id into v_inicio_b, v_salon_b
    from public.appointments where id = p_b for update;

  if v_inicio_a is null or v_inicio_b is null then
    raise exception 'Agendamento nao encontrado';
  end if;

  if v_salon_a is distinct from v_salon_b then
    raise exception 'Os agendamentos sao de barbearias diferentes';
  end if;

  if not private.is_manager(v_salon_a) then
    raise exception 'Apenas dono ou gerente pode adiantar horario';
  end if;

  set constraints all deferred;

  -- O fim de cada um é recalculado pelo trigger, pela duração do PRÓPRIO
  -- serviço — ver `0064`, que existe por causa deste teste.
  update public.appointments set data_hora_inicio = v_inicio_b where id = p_a;
  update public.appointments set data_hora_inicio = v_inicio_a where id = p_b;
end;
$$;

comment on function public.trocar_horarios(uuid, uuid) is
  'Troca o horario de dois agendamentos da mesma barbearia. Usa constraint adiada: o arranjo e validado no commit, nao no meio da troca.';

revoke execute on function public.trocar_horarios(uuid, uuid) from public;
grant execute on function public.trocar_horarios(uuid, uuid) to authenticated, service_role;
