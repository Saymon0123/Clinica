-- Mover um agendamento não recalculava o fim.
--
-- O trigger da `0035` só disparava em INSERT, e ainda saía cedo quando
-- `data_hora_fim` já estava preenchido — o que é sempre verdade num update.
-- Resultado: mudar o início arrastava o começo e deixava o fim onde estava.
--
-- **Achado testando a troca de horários em 2026-08-16.** Um agendamento de 30
-- minutos movido de 11:00 para 10:30 virou uma **hora** (10:30 às 11:30), e o
-- outro, movido de 10:30 para 11:00, ficou com duração **zero**.
--
-- O caso da duração zero é o pior: um intervalo vazio não colide com nada, então
-- a trava de sobreposição **aceitou** — o horário sumia da agenda sem erro
-- nenhum, e ninguém saberia.
--
-- Não é defeito da troca: vale para **qualquer** alteração de horário, inclusive
-- pelo CRM. Só não tinha aparecido porque mover agendamento é raro.

create or replace function public.calcula_fim_do_agendamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  minutos int;
begin
  -- No INSERT, respeita o fim informado: é assim que `bloqueio` cria intervalo
  -- de duração arbitrária, sem serviço.
  if tg_op = 'INSERT' and new.data_hora_fim is not null then
    return new;
  end if;

  -- No UPDATE, só recalcula quando o INÍCIO mudou e o fim NÃO foi informado
  -- junto. Quem manda os dois sabe o que quer — é o caso do bloqueio sendo
  -- redimensionado.
  if tg_op = 'UPDATE' then
    if new.data_hora_inicio = old.data_hora_inicio then
      return new;
    end if;
    if new.data_hora_fim is distinct from old.data_hora_fim then
      return new;
    end if;
  end if;

  if new.service_id is null then
    -- Sem serviço não há duração a aplicar. No update isso é o bloqueio sendo
    -- movido: preserva a duração que ele já tinha em vez de falhar.
    if tg_op = 'UPDATE' then
      new.data_hora_fim := new.data_hora_inicio + (old.data_hora_fim - old.data_hora_inicio);
      return new;
    end if;
    raise exception 'Sem service_id nao da para calcular o fim do agendamento; informe data_hora_fim.'
      using errcode = '23502';
  end if;

  select s.duracao_minutos into minutos
    from public.services s where s.id = new.service_id;

  if minutos is null then
    raise exception 'Servico % nao encontrado ou sem duracao.', new.service_id
      using errcode = '23503';
  end if;

  new.data_hora_fim := new.data_hora_inicio + make_interval(mins => minutos);
  return new;
end;
$$;

drop trigger if exists appointments_calcula_fim on public.appointments;
create trigger appointments_calcula_fim
  before insert or update on public.appointments
  for each row execute function public.calcula_fim_do_agendamento();

comment on function public.calcula_fim_do_agendamento() is
  'Calcula data_hora_fim pela duracao do servico. No INSERT respeita o fim informado (bloqueio); no UPDATE recalcula quando o inicio muda e o fim nao veio junto.';
