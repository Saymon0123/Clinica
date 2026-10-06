-- O aviso do imprevisto, com motor próprio (folga, parte 2)
--
-- ## Por que motor próprio, e não o da fila
--
-- O desenho aprovado em 04/10 dizia que o aviso escalonado *"é a fila de espera
-- ao contrário, e reusa o mesmo motor"*. Em 05/10 o dono adiou a fila — então
-- reusar o motor dela seria pendurar um recurso vivo num que está desligado por
-- decisão.
--
-- São parecidos, mas não iguais: a fila **procura vaga para quem espera**; este
-- **procura gente para avisar que a vaga sumiu**. A fila chama em paralelo e
-- segura reserva; este chama **um de cada vez** e não segura nada.
--
-- ## O problema
--
-- A folga (0213) fecha o dia para novos. Os que já estavam marcados continuam
-- lá — e é isso que a folga sozinha não resolve: *"no dia 7 ele possui 10
-- agendamentos"*. Alguém tem de avisar essas dez pessoas.
--
-- ## As regras, todas decididas pelo dono em 04/10
--
-- 1. **Do horário mais cedo para o mais tarde.**
-- 2. **Um aviso só por pessoa.** Quem não remarca perde o horário sem novo
--    aviso — *"mesmo que ele vá reclamar, ele foi avisado"*.
-- 3. **Um de cada vez**, para o primeiro escolher antes de o segundo ser
--    avisado — senão dez pessoas disputam as mesmas vagas.
-- 4. **No prazo final, quem não respondeu é cancelado**, e o dia esvazia.
--
-- ## O prazo de cada pessoa
--
-- O dono decidiu a forma, não o número. Aqui ele é **calculado**, não fixo:
--
--     prazo = min(tempo que falta até o dia ÷ quem ainda falta avisar, teto)
--
-- com teto de 3 horas (parâmetro) e **piso de 30 minutos**. Fixo não serve: uma
-- folga marcada com três dias de antecedência tem folga de sobra, e uma marcada
-- para amanhã com dez pessoas não tem.
--
-- **Quando o piso não cabe, o escalonamento é abandonado** e todo mundo é
-- avisado de uma vez, com prazo até o começo do dia. É a escolha menos ruim:
-- avisar dez pessoas juntas disputando vagas é ruim, mas deixar a décima sem
-- aviso nenhum e cancelá-la no dia é pior — e romperia a promessa da regra 2.
--
-- ## Como se sabe que a pessoa resolveu
--
-- Pelo próprio agendamento, não por resposta. O template tem **um botão de
-- URL** (a Meta não deixa misturar resposta rápida com link — ver
-- `templates-para-a-meta.md`), e ele leva à página de gestão, onde o cliente
-- remarca ou cancela sozinho desde a 0176. Remarcou: sai do dia. Cancelou: sai
-- do `agendado/confirmado`. Nos dois casos ele deixa de ser candidato, e o
-- próximo anda. Não há webhook de resposta para manter.
--
-- ## Reivindicar antes de enviar, e devolver quando o envio falha
--
-- `proximos_avisos_do_imprevisto` **grava a linha antes** de o n8n enviar: sem
-- isso, duas varreduras sobrepostas avisariam a mesma pessoa duas vezes, o que
-- a regra 2 proíbe. Em troca, o fluxo precisa **devolver** a reivindicação
-- quando o envio falha (`devolver_aviso_do_imprevisto`) — senão uma falha de
-- rede consumiria o aviso único de alguém que nunca o recebeu.
--
-- É o espelho do que a fila faz com `onError=continueErrorOutput`, invertido:
-- lá se grava depois do envio porque o que se guarda é o WAMID; aqui se grava
-- antes porque o que se guarda é o LUGAR na fila.
--
-- ## Quem não tem telefone utilizável
--
-- Entra na reivindicação do mesmo jeito, com `destino` nulo na resposta — o n8n
-- não envia, e a fila anda em vez de travar para sempre no mesmo nome. Ele será
-- cancelado no prazo como os outros, e aparece na agenda do dono, que liga à
-- mão. Travar a fila por causa dele deixaria todos os seguintes sem aviso.

create table public.avisos_do_imprevisto (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  -- O WAMID, gravado DEPOIS do envio. Nulo entre a reivindicação e a confirmação
  -- do n8n — e também para quem não tem destino montável.
  message_id text,
  prazo timestamptz not null,
  reivindicado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- A chave primária por `appointment_id` É a regra 2: um aviso só por pessoa, e
-- o banco não deixa um segundo nascer nem em corrida.

-- A varredura pergunta sempre "quem desta folga já foi reivindicado?".
create index avisos_do_imprevisto_por_prazo on public.avisos_do_imprevisto (prazo);

alter table public.avisos_do_imprevisto enable row level security;

-- Sem política: ninguém lê isto pelo REST. O n8n usa service_role (que ignora
-- RLS) e as funções são `security definer`. É o mesmo desenho de `fila_avisos`.
revoke all on public.avisos_do_imprevisto from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quem avisar agora.
-- ---------------------------------------------------------------------------
create or replace function private.proximos_avisos_do_imprevisto(
  p_limite integer default 10,
  p_horas_max integer default 3
) returns table(
  appointment_id uuid,
  salon_id uuid,
  cliente text,
  destino text,
  barbearia text,
  data_local text,
  hora_local text,
  token text,
  prazo timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := 'America/Sao_Paulo';
  v_f record;
  v_pendentes integer;
  v_inicio_do_dia timestamptz;
  v_janela interval;
  v_por_pessoa interval;
  v_prazo timestamptz;
  v_quantos integer;
begin
  for v_f in
    select df.professional_id, df.dia, p.salon_id, s.nome as barbearia
      from public.dias_de_folga df
      join public.professionals p on p.id = df.professional_id
      join public.salons s on s.id = p.salon_id
     where df.dia >= (now() at time zone v_tz)::date
       and s.ativo
     order by df.dia
  loop
    -- Quem ainda falta avisar nesta folga.
    select count(*) into v_pendentes
      from public.appointments a
     where a.professional_id = v_f.professional_id
       and (a.data_hora_inicio at time zone v_tz)::date = v_f.dia
       and a.status in ('agendado', 'confirmado')
       and not exists (select 1 from public.avisos_do_imprevisto av
                        where av.appointment_id = a.id);
    if v_pendentes = 0 then
      continue;
    end if;

    v_inicio_do_dia := (v_f.dia::text || ' 00:00')::timestamp at time zone v_tz;
    v_janela := v_inicio_do_dia - now();
    -- O dia chegou e ainda há gente marcada: avisar agora não adianta mais.
    -- Quem resolve isso é `cancelar_vencidos_do_imprevisto`.
    if v_janela <= interval '0' then
      continue;
    end if;

    v_por_pessoa := least(v_janela / v_pendentes, make_interval(hours => p_horas_max));

    if v_por_pessoa >= interval '30 minutes' then
      -- Escalonado: um de cada vez. Se alguém já está com o prazo correndo,
      -- esta folga espera.
      if exists (
        select 1 from public.avisos_do_imprevisto av
          join public.appointments a on a.id = av.appointment_id
         where a.professional_id = v_f.professional_id
           and (a.data_hora_inicio at time zone v_tz)::date = v_f.dia
           and a.status in ('agendado', 'confirmado')
           and av.prazo > now()
      ) then
        continue;
      end if;
      v_quantos := 1;
      v_prazo := now() + v_por_pessoa;
    else
      -- Não cabe escalonar: todo mundo de uma vez, com prazo até o dia começar.
      v_quantos := v_pendentes;
      v_prazo := v_inicio_do_dia;
    end if;

    return query
    with escolhidos as (
      select a.id
        from public.appointments a
       where a.professional_id = v_f.professional_id
         and (a.data_hora_inicio at time zone v_tz)::date = v_f.dia
         and a.status in ('agendado', 'confirmado')
         and not exists (select 1 from public.avisos_do_imprevisto av
                          where av.appointment_id = a.id)
       order by a.data_hora_inicio
       limit least(v_quantos, p_limite)
    ),
    reivindicados as (
      insert into public.avisos_do_imprevisto (appointment_id, prazo)
      select e.id, v_prazo from escolhidos e
      returning avisos_do_imprevisto.appointment_id, avisos_do_imprevisto.prazo
    )
    select r.appointment_id,
           v_f.salon_id,
           c.nome,
           private.destino_whatsapp(c.telefone),
           v_f.barbearia,
           to_char(a.data_hora_inicio at time zone v_tz, 'DD/MM'),
           to_char(a.data_hora_inicio at time zone v_tz, 'HH24:MI'),
           a.token_gestao::text,
           r.prazo
      from reivindicados r
      join public.appointments a on a.id = r.appointment_id
      join public.clients c on c.id = a.client_id
     order by a.data_hora_inicio;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O envio deu certo: guarda o WAMID.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_aviso_do_imprevisto(
  p_appointment_id uuid,
  p_message_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ok boolean;
begin
  update public.avisos_do_imprevisto
     set message_id = p_message_id, enviado_em = now()
   where appointment_id = p_appointment_id
  returning true into v_ok;

  if v_ok is null then
    return jsonb_build_object('ok', false, 'motivo', 'Aviso nao reivindicado.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- O envio falhou: devolve o lugar, para a pessoa não perder o aviso único.
-- ---------------------------------------------------------------------------
create or replace function public.devolver_aviso_do_imprevisto(
  p_appointment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Só devolve o que ainda NAO foi enviado: se o WAMID já está gravado, a
  -- mensagem saiu, e apagar aqui faria a pessoa ser avisada duas vezes.
  delete from public.avisos_do_imprevisto
   where appointment_id = p_appointment_id
     and message_id is null;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- O prazo acabou: o dia esvazia.
-- ---------------------------------------------------------------------------
create or replace function private.cancelar_vencidos_do_imprevisto()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := 'America/Sao_Paulo';
  v_n integer;
begin
  with vencidos as (
    select a.id
      from public.avisos_do_imprevisto av
      join public.appointments a on a.id = av.appointment_id
      join public.dias_de_folga df
        on df.professional_id = a.professional_id
       and df.dia = (a.data_hora_inicio at time zone v_tz)::date
     where av.prazo <= now()
       and a.status in ('agendado', 'confirmado')
  )
  update public.appointments a
     set status = 'cancelado', cancelado_por = 'barbearia'
    from vencidos v
   where a.id = v.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A varredura, para o n8n chamar.
-- ---------------------------------------------------------------------------
create or replace function public.rodar_os_avisos_do_imprevisto(
  p_limite integer default 10,
  p_horas_max integer default 3
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cancelados integer;
  v_avisos jsonb;
begin
  -- PRIMEIRO o cancelamento: quem venceu deixa de ser candidato, e só então a
  -- conta de "quem ainda falta avisar" fica certa. Na ordem inversa, o vencido
  -- entraria na divisão do prazo e encurtaria o de quem ainda tem chance.
  v_cancelados := private.cancelar_vencidos_do_imprevisto();

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_avisos
    from private.proximos_avisos_do_imprevisto(p_limite, p_horas_max) x;

  return jsonb_build_object(
    'cancelados', v_cancelados,
    'avisos', v_avisos);
end;
$function$;

-- O trinco, reposto à mão. Só o service_role (n8n) chama estas funções; o CRM
-- não tem o que fazer com elas.
revoke all on function private.proximos_avisos_do_imprevisto(integer, integer) from public, anon, authenticated;
revoke all on function private.cancelar_vencidos_do_imprevisto() from public, anon, authenticated;
revoke all on function public.rodar_os_avisos_do_imprevisto(integer, integer) from public, anon, authenticated;
revoke all on function public.registrar_aviso_do_imprevisto(uuid, text) from public, anon, authenticated;
revoke all on function public.devolver_aviso_do_imprevisto(uuid) from public, anon, authenticated;
grant execute on function public.rodar_os_avisos_do_imprevisto(integer, integer) to service_role;
grant execute on function public.registrar_aviso_do_imprevisto(uuid, text) to service_role;
grant execute on function public.devolver_aviso_do_imprevisto(uuid) to service_role;
