-- Dizer sim para a vaga da fila.
--
-- Escrevendo a seção da fila no prompt do agente eu travei numa frase: *"se ele
-- tiver vaga segurada, confirme com Criar Agendamento"*. **Isso estaria errado.**
--
-- A vaga segurada JÁ É um `appointments`, com status `reservado`. Chamar o
-- `Criar Agendamento` criaria um SEGUNDO agendamento no mesmo minuto para o
-- mesmo cliente, e a trava `appointments_cliente_sem_sobreposicao` recusaria com
-- 23P01 -- o cliente diria "quero" e ouviria que não deu, com a vaga dele na
-- mão.
--
-- Ou seja: a fila sabia chamar e **ninguém sabia dizer sim**. O buraco não
-- apareceu no ensaio nem no pgTAP, porque os dois testavam a chamada; apareceu
-- quando fui escrever a instrução que descreve o caminho inteiro. Vale como
-- lição: o caminho de volta é parte da funcionalidade, e escrever o passo a passo
-- em português é um jeito de encontrar o pedaço que falta.
--
-- ## O que confirmar significa
--
-- A reserva vira agendamento de verdade: `status = 'agendado'` e
-- `reservada_ate = null` -- os dois na mesma instrução, porque o CHECK
-- `appointments_reserva_com_prazo` exige prazo quando o status é `reservado` e
-- exige a AUSÊNCIA de prazo quando não é. Mexer num sem o outro levanta 23514.
--
-- A inscrição fica `atendido`: ela cumpriu o que prometia.
--
-- ## Por que não há checagem de quem chama
--
-- Mesmo desenho do `agendar_pelo_agente`: quem chama é o agente, com a chave de
-- `service_role`, para quem `private.salon_ids()` não devolve nada (não há JWT).
-- Uma checagem de unidade recusaria justamente o chamador legítimo. A porta é o
-- `grant`, e a validação é dos DADOS -- a inscrição existe, está `chamado`, e a
-- reserva ainda está de pé.
--
-- ## Prazo vencido é conversa, não erro
--
-- Entre o aviso e o "quero" o prazo pode ter vencido, e aí a varredura já apagou
-- a reserva. Isso volta como `{ok:false, motivo}` para o agente dizer *"esse
-- horário acabou de sair, quer que eu veja outro?"* -- e não como exceção, que o
-- agente traduziria em "houve um problema".

create or replace function public.confirmar_vaga_da_fila(p_fila_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_status text;
  v_ag uuid;
  v_inicio timestamptz;
  v_prazo timestamptz;
begin
  if p_fila_id is null then
    raise exception 'Faltou a inscricao.' using errcode = '22023';
  end if;

  select f.status, f.appointment_id into v_status, v_ag
    from public.fila_de_espera f
   where f.id = p_fila_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'motivo', 'Essa inscricao nao existe.');
  end if;
  if v_status <> 'chamado' or v_ag is null then
    return jsonb_build_object('ok', false,
      'motivo', 'Essa pessoa nao tem vaga segurada agora.');
  end if;

  select a.data_hora_inicio, a.reservada_ate into v_inicio, v_prazo
    from public.appointments a
   where a.id = v_ag and a.status = 'reservado';

  -- A varredura pode ter passado entre o aviso e o "quero".
  if v_inicio is null then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario acabou de sair da reserva.');
  end if;
  if v_prazo is not null and v_prazo < now() then
    return jsonb_build_object('ok', false,
      'motivo', 'O prazo da reserva venceu.');
  end if;

  -- Os dois campos na MESMA instrucao: o CHECK appointments_reserva_com_prazo
  -- exige prazo quando o status e `reservado` e exige a AUSENCIA de prazo quando
  -- nao e. Mexer num sem o outro levanta 23514.
  update public.appointments
     set status = 'agendado',
         reservada_ate = null
   where id = v_ag;

  update public.fila_de_espera
     set status = 'atendido', encerrada_em = now()
   where id = p_fila_id;

  return jsonb_build_object('ok', true,
    'appointment_id', v_ag,
    'quando', case
      when (v_inicio at time zone v_tz)::date = (now() at time zone v_tz)::date then 'hoje'
      when (v_inicio at time zone v_tz)::date = (now() at time zone v_tz)::date + 1 then 'amanha'
      else 'dia ' || to_char(v_inicio at time zone v_tz, 'DD/MM')
    end,
    'hora_local', to_char(v_inicio at time zone v_tz, 'HH24:MI'),
    'profissional', (select p.nome from public.professionals p
                      join public.appointments a on a.professional_id = p.id
                     where a.id = v_ag),
    'servicos', coalesce((select string_agg(s.nome, ' + ' order by asv.ordem)
                            from public.appointment_services asv
                            join public.services s on s.id = asv.service_id
                           where asv.appointment_id = v_ag), ''));
end;
$function$;

revoke all on function public.confirmar_vaga_da_fila(uuid) from public, anon, authenticated;
grant execute on function public.confirmar_vaga_da_fila(uuid) to service_role;

comment on function public.confirmar_vaga_da_fila(uuid) is
  'O "quero" do cliente que foi chamado pela fila: a reserva (status reservado) vira agendamento de verdade e a inscricao fica atendido. Existe porque Criar Agendamento NAO serve aqui -- criaria um segundo agendamento no mesmo minuto para o mesmo cliente e a trava por cliente recusaria com 23P01, fazendo o cliente ouvir "nao deu" com a vaga dele na mao. status e reservada_ate mudam na MESMA instrucao: o CHECK exige prazo quando reservado e exige a ausencia dele quando nao. Prazo vencido volta como ok:false para virar conversa, nao excecao.';

notify pgrst, 'reload schema';
