-- 0176: o cliente mexe no próprio horário (fase 1 — o coração no banco).
--
-- O CASO. O cliente marca um corte pelo WhatsApp e dez minutos depois lembra
-- da sobrancelha. Manda mensagem — e o agente não tem NENHUMA ferramenta que
-- altere um agendamento: só criar, cancelar e confirmar presença. O prompt
-- ensina "reagendar = cancelar + criar", que funciona mal e ainda suja as
-- métricas de campanha (cada remarcação conta um cancelamento na ficha de um
-- cliente que não cancelou nada). Pela agenda pública é parecido: remarcar
-- remarca (0169), mas a lista de serviços é travada de propósito.
--
-- Esta migration cria as três operações que faltam, para as DUAS portas
-- (agente n8n e edge da agenda pública) usarem o mesmo coração:
--
--   1. alterar_servicos_pelo_cliente  — a sobrancelha depois do corte;
--   2. remarcar_pelo_cliente          — remarcar DE VERDADE pelo agente,
--                                       mesmo agendamento, histórico limpo;
--   3. agendar_pelo_agente            — criar já com VÁRIOS serviços (o
--                                       insert atual do agente é de um só) e
--                                       com validação de vaga de servidor.
--
-- AS RÉGUAS DO CLIENTE (mais estreitas que as do CRM, de propósito):
--   · só horário de pé ('agendado'/'confirmado');
--   · piso de 30 minutos (private.pode_cancelar, 0166) — a mesma regra do
--     cancelar, porque esvaziar ou esticar a cadeira em cima da hora dói igual;
--   · serviço precisa estar ATIVO (o CRM aceita inativo; o cliente não);
--   · esticar não pode passar do fim da jornada do barbeiro nem do fechamento
--     do salão — regra que o CRM não tem (o barbeiro decide da própria hora
--     extra; o cliente não decide por ele).
--
-- QUEM DECIDE COLISÃO É A TRAVA (0063), não uma segunda régua aqui: o UPDATE
-- que não cabe estoura `appointments_sem_sobreposicao` e o bloco EXCEPTION
-- devolve `ok=false` com o motivo — a subtransação desfaz as filhas sozinha.
-- Já a VAGA de um horário novo (remarcar/criar) é validada por
-- `horarios_livres` (0169), a mesma régua da agenda pública: grade, jornada,
-- fechamento e folga entre atendimentos, tudo numa fonte só.
--
-- RETORNO É JSONB, NUNCA LINHA MUDA: o prompt do agente exige "só diga que
-- fez DEPOIS de receber de volta a linha alterada" — e recusa de negócio
-- (não cabe, não tem vaga) volta como {ok:false, motivo, sugestoes} para o
-- agente CONVERSAR a alternativa em vez de engolir um erro 400. Exception
-- fica para chamada malfeita (id errado, sem autorização), que conversa
-- nenhuma resolve.
--
-- O TRINCO É REPOSTO À MÃO (lição da 0169): função nova nasce com EXECUTE
-- para `public`. As três são só das duas portas de servidor — service_role.

-- ---------------------------------------------------------------------------
-- 1) Adicionar/trocar serviços de um agendamento de pé
-- ---------------------------------------------------------------------------
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

  -- FOR UPDATE: duas mudanças simultâneas no mesmo horário entram em fila em
  -- vez de calcular o fim uma por cima da outra.
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

  -- Serviços do salão E ativos — validados ANTES de tocar em qualquer linha.
  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = v_ag.salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outro salao, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  -- A duração nova, calculada do pedido (com duplicata descontada) para poder
  -- recusar SEM ter mexido em nada.
  select sum(s.duracao_minutos) into v_minutos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Servico sem duracao cadastrada.' using errcode = '22023';
  end if;
  v_fim := v_ag.data_hora_inicio + make_interval(mins => v_minutos);

  -- O fim novo não passa da jornada do barbeiro nem do fechamento do salão.
  -- Checagem tolerante a dado ausente: sem jornada cadastrada (o CRM já marcou
  -- fora dela) ou sem horário válido no dia, a régua não se aplica — o alterar
  -- não pode ser mais realista que a criação foi.
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

  -- A escrita, num sub-bloco: se a trava de sobreposição recusar o fim novo,
  -- a subtransação desfaz filhas e tudo, e a recusa vira conversa.
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
  'A sobrancelha lembrada depois do corte: troca a lista de servicos de um agendamento DE PE, recalcula o fim e deixa a trava de sobreposicao decidir se cabe. Porta do CLIENTE (agente por p_client_id, agenda publica por p_token) — o CRM continua com definir_servicos_do_agendamento. Regras: 30min de antecedencia, servico ativo, nao passa da jornada nem do fechamento. Devolve {ok:false, motivo} para recusa de negocio.';

-- ---------------------------------------------------------------------------
-- 2) Remarcar de verdade pelo agente — mesmo agendamento, outro horário
-- ---------------------------------------------------------------------------
create or replace function public.remarcar_pelo_cliente(
  p_appointment_id uuid,
  p_novo_inicio timestamptz,
  p_client_id uuid,
  p_professional_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_ag public.appointments%rowtype;
  v_minutos int;
  v_prof uuid;
  v_dia date;
  v_sugestoes jsonb;
begin
  if p_client_id is null then
    raise exception 'Sem autorizacao: informe p_client_id.' using errcode = '42501';
  end if;
  if p_novo_inicio is null then
    raise exception 'Informe o novo horario.' using errcode = '22023';
  end if;

  select * into v_ag
    from public.appointments a
   where a.id = p_appointment_id
     and a.client_id = p_client_id
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado.' using errcode = '42501';
  end if;

  if v_ag.status not in ('agendado', 'confirmado') then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario ja nao esta mais de pe.');
  end if;
  -- O piso vale sobre o horário ATUAL (mesma decisão da edge, 0166): mover às
  -- 14:50 um corte das 15:00 esvazia a cadeira igual a um cancelamento.
  if not private.pode_cancelar(v_ag.data_hora_inicio) then
    return jsonb_build_object('ok', false,
      'motivo', 'Falta menos de 30 minutos para o horario atual. Mudanca agora e so falando com a barbearia.');
  end if;

  v_prof := coalesce(p_professional_id, v_ag.professional_id);

  -- A duração é a dos serviços QUE JÁ ESTÃO no agendamento — remarcar muda
  -- QUANDO, nunca O QUE (fallback no principal, como a view do agente).
  select coalesce(
           (select sum(s.duracao_minutos)
              from public.appointment_services asv
              join public.services s on s.id = asv.service_id
             where asv.appointment_id = v_ag.id),
           (select s.duracao_minutos from public.services s where s.id = v_ag.service_id)
         )
    into v_minutos;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Agendamento sem duracao calculavel.' using errcode = '22023';
  end if;

  -- A vaga nova passa pela MESMA régua da agenda pública (0169): grade,
  -- jornada, fechamento e folga, ignorando o próprio horário que vai sair.
  v_dia := (p_novo_inicio at time zone v_tz)::date;
  if not exists (
    select 1
      from public.horarios_livres(v_ag.salon_id, v_dia, v_minutos, v_prof, v_ag.id) h
     where h.inicio = p_novo_inicio
  ) then
    select jsonb_agg(x.hora_local) into v_sugestoes
      from (select h.hora_local
              from public.horarios_livres(v_ag.salon_id, v_dia, v_minutos, v_prof, v_ag.id) h
             order by h.inicio
             limit 3) x;
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario nao esta disponivel para esse profissional.',
      'sugestoes_no_dia', coalesce(v_sugestoes, '[]'::jsonb));
  end if;

  -- O pacote de campos é o MESMO da edge (0169): status volta a 'agendado'
  -- (a presença confirmada era da hora antiga) e o lembrete é rearmado — o
  -- enviado apontava para a hora velha, e os botões dele agiriam errado.
  update public.appointments
     set data_hora_inicio = p_novo_inicio,
         data_hora_fim = p_novo_inicio + make_interval(mins => v_minutos),
         professional_id = v_prof,
         status = 'agendado',
         lembrete_enviado = false,
         lembrete_message_id = null,
         lembrete_respondido_em = null,
         envio_reservado_ate = null,
         reagendamento_pedido_em = null,
         remarcado_pelo_cliente_em = now()
   where id = v_ag.id;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_ag.id,
    'inicio', to_char(p_novo_inicio at time zone v_tz, 'DD/MM/YYYY HH24:MI'),
    'profissional', (select p.nome from public.professionals p where p.id = v_prof),
    'servicos', (select coalesce(
                   (select string_agg(s.nome, ' + ' order by asv.ordem)
                      from public.appointment_services asv
                      join public.services s on s.id = asv.service_id
                     where asv.appointment_id = v_ag.id),
                   (select s.nome from public.services s where s.id = v_ag.service_id)))
  );
end;
$$;

comment on function public.remarcar_pelo_cliente(uuid, timestamptz, uuid, uuid) is
  'Remarcar DE VERDADE pelo agente do WhatsApp: mesmo agendamento, mesmo token de gestao, historico limpo — mata o "cancelar + criar" que contava um cancelamento falso na ficha do cliente. Vaga validada por horarios_livres (regua unica com a agenda publica), piso de 30min sobre o horario ATUAL, lembrete rearmado. A edge da agenda publica continua com o fluxo dela por token.';

-- ---------------------------------------------------------------------------
-- 3) Criar pelo agente já com vários serviços e vaga validada
-- ---------------------------------------------------------------------------
create or replace function public.agendar_pelo_agente(
  p_salon_id uuid,
  p_client_id uuid,
  p_professional_id uuid,
  p_service_ids uuid[],
  p_inicio timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_qtd int;
  v_minutos int;
  v_dia date;
  v_id uuid;
  v_sugestoes jsonb;
  v_constraint text;
begin
  if p_salon_id is null or p_client_id is null or p_professional_id is null or p_inicio is null then
    raise exception 'Faltou salon, cliente, profissional ou horario.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  -- Vínculos: cliente e profissional (ativo) do salão informado. O agente já
  -- recebe tudo do contexto, mas UUID trocado não pode virar agendamento no
  -- salão errado.
  if not exists (select 1 from public.clients c
                  where c.id = p_client_id and c.salon_id = p_salon_id) then
    raise exception 'Cliente nao e deste salao.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.professionals p
                  where p.id = p_professional_id and p.salon_id = p_salon_id and p.ativo) then
    raise exception 'Profissional nao e deste salao ou esta inativo.' using errcode = '42501';
  end if;

  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outro salao, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  select sum(s.duracao_minutos) into v_minutos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Servico sem duracao cadastrada.' using errcode = '22023';
  end if;

  -- A vaga pela régua oficial (horarios_livres): o insert cru que o agente
  -- fazia até aqui só era barrado pela trava no commit — sem jornada, sem
  -- fechamento, sem folga. Recusa volta com sugestões do dia, para o agente
  -- oferecer alternativa em vez de só dizer "não deu".
  v_dia := (p_inicio at time zone v_tz)::date;
  if not exists (
    select 1
      from public.horarios_livres(p_salon_id, v_dia, v_minutos, p_professional_id) h
     where h.inicio = p_inicio
  ) then
    select jsonb_agg(x.hora_local) into v_sugestoes
      from (select h.hora_local
              from public.horarios_livres(p_salon_id, v_dia, v_minutos, p_professional_id) h
             order by h.inicio
             limit 3) x;
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario nao esta disponivel para esse profissional.',
      'sugestoes_no_dia', coalesce(v_sugestoes, '[]'::jsonb));
  end if;

  begin
    insert into public.appointments
      (salon_id, client_id, professional_id, service_id,
       data_hora_inicio, data_hora_fim, status, origem)
    values
      (p_salon_id, p_client_id, p_professional_id, p_service_ids[1],
       p_inicio, p_inicio + make_interval(mins => v_minutos), 'agendado', 'agente')
    returning id into v_id;

    -- O principal já entrou na filha pelo espelho (0120); o resto entra aqui
    -- na ordem pedida.
    insert into public.appointment_services (appointment_id, service_id, ordem)
    select v_id, u.sid, u.ord
      from unnest(p_service_ids) with ordinality as u(sid, ord)
     where u.ord > 1
    on conflict do nothing;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'appointments_cliente_sem_sobreposicao' then
        return jsonb_build_object('ok', false,
          'motivo', 'Este cliente ja tem outro horario que conflita com esse.');
      end if;
      return jsonb_build_object('ok', false,
        'motivo', 'Esse horario acabou de ser pego. Escolha outro.');
  end;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_id,
    'inicio', to_char(p_inicio at time zone v_tz, 'DD/MM/YYYY HH24:MI'),
    'fim', to_char((p_inicio + make_interval(mins => v_minutos)) at time zone v_tz, 'HH24:MI'),
    'profissional', (select p.nome from public.professionals p where p.id = p_professional_id),
    'servicos', (select string_agg(s.nome, ' + ' order by asv.ordem)
                   from public.appointment_services asv
                   join public.services s on s.id = asv.service_id
                  where asv.appointment_id = v_id),
    'preco_total', (select sum(s.preco)
                      from public.appointment_services asv
                      join public.services s on s.id = asv.service_id
                     where asv.appointment_id = v_id)
  );
end;
$$;

comment on function public.agendar_pelo_agente(uuid, uuid, uuid, uuid[], timestamptz) is
  'Criacao de agendamento pelo agente do WhatsApp com VARIOS servicos (o insert antigo era de um so) e vaga validada por horarios_livres antes de gravar — jornada, fechamento, folga e grade, a mesma regua da agenda publica. Recusa devolve {ok:false, motivo, sugestoes_no_dia} para o agente oferecer alternativa.';

-- ---------------------------------------------------------------------------
-- O trinco
-- ---------------------------------------------------------------------------
revoke execute on function public.alterar_servicos_pelo_cliente(uuid, uuid[], uuid, uuid) from public, anon, authenticated;
revoke execute on function public.remarcar_pelo_cliente(uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.agendar_pelo_agente(uuid, uuid, uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.alterar_servicos_pelo_cliente(uuid, uuid[], uuid, uuid) to service_role;
grant execute on function public.remarcar_pelo_cliente(uuid, timestamptz, uuid, uuid) to service_role;
grant execute on function public.agendar_pelo_agente(uuid, uuid, uuid, uuid[], timestamptz) to service_role;
