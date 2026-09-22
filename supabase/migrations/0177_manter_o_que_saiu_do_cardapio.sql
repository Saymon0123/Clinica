-- 0177: manter o que saiu do cardápio (correção da 0176, achada percorrendo
-- os caminhos antes de escrever a tela).
--
-- O CAMINHO QUE NINGUÉM PREVIU. `alterar_servicos_pelo_cliente` exige que
-- TODO serviço da lista esteja ATIVO. Parece certo — até a barbearia inativar
-- um serviço que já tem horário marcado para a semana que vem. A lista
-- completa daquele agendamento passa a conter um inativo, e então:
--
--   · o cliente que quer só ACRESCENTAR a sobrancelha manda [antigo, sobrancelha]
--     e leva um 22023 — ele não consegue mexer em nada, por causa de uma
--     decisão da barbearia que não é sobre ele;
--   · pior, 22023 é exception, não {ok:false}: vira 500 na edge ("não foi
--     possível, tente novamente") e o agente do WhatsApp lê como falha de
--     sistema. Erro genérico para uma situação que tem explicação.
--
-- A REGRA CERTA é mais estreita que "tudo ativo" e mais larga que "qualquer
-- coisa": pode MANTER o que já está no agendamento, mesmo fora do cardápio;
-- não pode ADICIONAR o que a barbearia tirou. Quem já tinha, tinha.
--
-- Só o bloco de validação muda; o resto é reprodução (plpgsql não tem patch
-- parcial). `create or replace` mantém assinatura, permissões e comentário.

create or replace function public.alterar_servicos_pelo_cliente(
  p_appointment_id uuid,
  p_service_ids uuid[],
  p_client_id uuid default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_ag public.appointments%rowtype;
  v_qtd int;
  v_minutos int;
  v_fim timestamptz;
  v_dia date;
  v_fim_local time;
  v_jornada_fim time;
  v_fecha text;
  v_constraint text;
begin
  if p_client_id is null and p_token is null then
    raise exception 'Sem autorizacao: informe p_client_id ou p_token.'
      using errcode = '42501';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  select * into v_ag
    from public.appointments a
   where a.id = p_appointment_id
     and (p_token is null or a.token_gestao = p_token)
     and (p_client_id is null or a.client_id = p_client_id)
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado.' using errcode = '42501';
  end if;

  if v_ag.status not in ('agendado', 'confirmado') then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario ja nao esta mais de pe.');
  end if;
  if not private.pode_cancelar(v_ag.data_hora_inicio) then
    return jsonb_build_object('ok', false,
      'motivo', 'Falta menos de 30 minutos para o horario. Mudanca agora e so falando com a barbearia.');
  end if;

  -- 0177: do salão, e ATIVO **ou já presente neste agendamento**. Manter o que
  -- saiu do cardápio pode; acrescentar o que saiu, não.
  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid
     and s.salon_id = v_ag.salon_id
     and (
       s.ativo
       or exists (select 1 from public.appointment_services asv
                   where asv.appointment_id = v_ag.id
                     and asv.service_id = d.sid)
     );
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outro salao, fora do cardapio ou inexistente.'
      using errcode = '22023';
  end if;

  select sum(s.duracao_minutos) into v_minutos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Servico sem duracao cadastrada.' using errcode = '22023';
  end if;
  v_fim := v_ag.data_hora_inicio + make_interval(mins => v_minutos);

  v_dia := (v_ag.data_hora_inicio at time zone v_tz)::date;
  v_fim_local := (v_fim at time zone v_tz)::time;

  select ps.hora_fim into v_jornada_fim
    from public.professional_schedules ps
   where ps.professional_id = v_ag.professional_id
     and ps.ativo
     and ps.dia_semana = extract(dow from v_dia)
   order by ps.hora_fim desc
   limit 1;
  if v_jornada_fim is not null and v_fim_local > v_jornada_fim then
    return jsonb_build_object('ok', false,
      'motivo', 'Com esse servico a mais o atendimento passaria do fim do expediente do profissional. Escolha um horario mais cedo (remarque) ou fale com a barbearia.');
  end if;

  select h.value->>'fecha' into v_fecha
    from public.salons s
    cross join lateral jsonb_each(s.horario_funcionamento) h
   where s.id = v_ag.salon_id
     and h.key = case extract(dow from v_dia)
                   when 0 then 'dom' when 1 then 'seg' when 2 then 'ter'
                   when 3 then 'qua' when 4 then 'qui' when 5 then 'sex'
                   else 'sab' end
     and (h.value->>'fecha') ~ '^[0-9]{1,2}:[0-9]{2}$';
  if v_fecha is not null and v_fim_local > v_fecha::time then
    return jsonb_build_object('ok', false,
      'motivo', 'Com esse servico a mais o atendimento passaria do horario de fechamento. Escolha um horario mais cedo (remarque) ou fale com a barbearia.');
  end if;

  begin
    delete from public.appointment_services where appointment_id = v_ag.id;
    insert into public.appointment_services (appointment_id, service_id, ordem)
    select v_ag.id, u.sid, u.ord
      from unnest(p_service_ids) with ordinality as u(sid, ord)
    on conflict do nothing;

    update public.appointments
       set service_id = p_service_ids[1],
           data_hora_fim = v_fim
     where id = v_ag.id;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'appointments_cliente_sem_sobreposicao' then
        return jsonb_build_object('ok', false,
          'motivo', 'O tempo a mais invade OUTRO horario que este cliente ja tem em seguida.');
      end if;
      return jsonb_build_object('ok', false,
        'motivo', 'O tempo a mais nao cabe: o horario seguinte do profissional ja esta ocupado. Remarque para um horario com folga ou fale com a barbearia.');
  end;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_ag.id,
    'inicio', to_char(v_ag.data_hora_inicio at time zone v_tz, 'DD/MM/YYYY HH24:MI'),
    'fim', to_char(v_fim at time zone v_tz, 'HH24:MI'),
    'duracao_minutos', v_minutos,
    'servicos', (select string_agg(s.nome, ' + ' order by asv.ordem)
                   from public.appointment_services asv
                   join public.services s on s.id = asv.service_id
                  where asv.appointment_id = v_ag.id),
    'preco_total', (select sum(s.preco)
                      from public.appointment_services asv
                      join public.services s on s.id = asv.service_id
                     where asv.appointment_id = v_ag.id)
  );
end;
$$;

comment on function public.alterar_servicos_pelo_cliente(uuid, uuid[], uuid, uuid) is
  'A sobrancelha lembrada depois do corte: troca a lista de servicos de um agendamento DE PE, recalcula o fim e deixa a trava de sobreposicao decidir se cabe. Porta do CLIENTE (agente por p_client_id, agenda publica por p_token). Regras: 30min de antecedencia, nao passa da jornada nem do fechamento, e servico do salao ATIVO ou ja presente no agendamento (0177 — quem ja tinha o que saiu do cardapio pode manter, ninguem pode acrescentar). Devolve {ok:false, motivo} para recusa de negocio.';
