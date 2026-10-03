-- A fila que chama.
--
-- A 0203 criou quem espera. Aqui a fila **anda**: procura a vaga, segura, e
-- devolve o que avisar.
--
-- ## Não existe evento de "abriu uma vaga", e isso é de propósito
--
-- A tentação era um trigger no cancelamento. Mas vaga abre de mais jeitos do que
-- isso: bloqueio removido, agendamento movido de barbeiro (item 18), horário de
-- funcionamento esticado, jornada de barbeiro ampliada, reserva da própria fila
-- que expirou. Um trigger no cancelamento cobriria **um** desses cinco e os
-- outros quatro passariam em silêncio.
--
-- Então não se detecta a abertura: pergunta-se, de tempo em tempo, *"existe vaga
-- que casa com esta inscrição?"*. A resposta vem do `horarios_livres`, que já
-- conhece jornada, folga, bloqueio, fechamento e vaga reservada -- e por isso
-- cobre os cinco casos de graça, mais os que ninguém pensou ainda.
--
-- É também o padrão da casa: o n8n pergunta ao banco o que fazer
-- (`reservar_lembretes`), e não existe outbox.
--
-- ## Três coisas no mesmo tique, e por que juntas
--
-- `rodar_a_fila` faz, nesta ordem:
--
-- 1. **encerra inscrição vencida** (`ate` já passou) -- limpeza;
-- 2. **devolve chamada sem resposta** para a fila -- `chamado` com reserva
--    apagada pela varredura;
-- 3. **chama os próximos**.
--
-- A ordem importa: sem o passo 2, uma inscrição em `chamado` nunca mais seria
-- olhada, porque o passo 3 só enxerga `esperando`. Ela ficaria presa para
-- sempre, e a pessoa nunca saberia por quê.
--
-- Cada passo é uma função `private` própria, para o pgTAP poder apertar uma por
-- uma; a fachada `public` existe porque o n8n só alcança `public` (a lição da
-- 0197) e porque um nó de HTTP é melhor que três.
--
-- ## Segunda chamada sem resposta encerra
--
-- `chamadas` conta. Uma chamada perdida não despeja ninguém -- a pessoa podia
-- estar no banho. Duas encerram: chamar para sempre é spam, e a vaga segurada
-- fica 30 minutos presa a cada tentativa, tempo que pertence a quem está atrás
-- na fila.
--
-- ## A inscrição que nunca poderia ser atendida
--
-- Pedir "o Thiago, para platinado" quando o Thiago não faz platinado é uma
-- inscrição que nunca casa com nada e fica esperando até vencer. Isso se recusa
-- **na porta**, não na chamada: o `entrar_na_fila` abaixo passa a devolver
-- `{ok:false, motivo}` nesse caso. Recusar na entrada é a diferença entre o
-- cliente ouvir "ele não faz esse serviço, quer com outro?" e esperar uma semana
-- por um telefone que não vai tocar.
--
-- ## Por que o `insert` da reserva pode falhar, e o que se faz
--
-- A vaga vem do `horarios_livres`, que olha a agenda do BARBEIRO. Mas o
-- `appointments` tem uma segunda trava, por CLIENTE: quem espera "qualquer coisa
-- essa semana" pode já ter horário marcado exatamente na hora que abriu. O
-- insert leva 23P01, e a resposta certa é **tentar a próxima vaga**, não desistir
-- da inscrição -- por isso o laço tenta algumas vagas antes de passar adiante.

------------------------------------------------------------------------------
-- A porta, agora recusando a inscrição impossível
------------------------------------------------------------------------------
create or replace function public.entrar_na_fila(
  p_salon_id uuid,
  p_client_id uuid,
  p_service_ids uuid[],
  p_de date,
  p_ate date,
  p_hora_de time default null,
  p_hora_ate time default null,
  p_professional_id uuid default null,
  p_origem text default 'crm'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  v_qtd int;
  v_ja uuid;
begin
  if p_salon_id is null or p_client_id is null or p_de is null or p_ate is null then
    raise exception 'Faltou barbearia, cliente ou a faixa de dias.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;
  if p_origem not in ('crm', 'agente') then
    raise exception 'Origem invalida.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.clients c
                  where c.id = p_client_id and c.salon_id = p_salon_id) then
    raise exception 'Cliente nao e desta barbearia.' using errcode = '42501';
  end if;

  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outra barbearia, inativo ou inexistente.'
      using errcode = '22023';
  end if;

  if p_professional_id is not null
     and not exists (select 1 from public.professionals p
                      where p.id = p_professional_id
                        and p.salon_id = p_salon_id
                        and p.ativo) then
    raise exception 'Profissional nao e desta barbearia ou esta inativo.'
      using errcode = '42501';
  end if;

  if p_ate < v_hoje then
    return jsonb_build_object('ok', false, 'motivo', 'Essa faixa de dias ja passou.');
  end if;
  if p_hora_de is not null and p_hora_ate is not null and p_hora_ate <= p_hora_de then
    return jsonb_build_object('ok', false,
      'motivo', 'A hora final precisa ser depois da inicial.');
  end if;

  -- NOVO na 0205: inscricao que nunca poderia ser atendida se recusa na PORTA.
  -- "O Thiago, para platinado" quando o Thiago nao faz platinado ficaria
  -- esperando ate vencer, e a pessoa nunca saberia por que o telefone nao
  -- tocou. Lista vazia conta como "faz todos", pela regua da 0199.
  if p_professional_id is not null
     and exists (select 1 from public.professional_services x
                  where x.professional_id = p_professional_id)
     and exists (
       select 1 from (select distinct sid from unnest(p_service_ids) as sid) d
        where not exists (select 1 from public.professional_services x
                           where x.professional_id = p_professional_id
                             and x.service_id = d.sid)) then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse barbeiro nao faz esse servico. Pode ser com outro?');
  end if;

  select f.id into v_ja
    from public.fila_de_espera f
   where f.salon_id = p_salon_id
     and f.client_id = p_client_id
     and f.status in ('esperando', 'chamado');
  if v_ja is not null then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse cliente ja esta na fila.', 'fila_id', v_ja);
  end if;

  insert into public.fila_de_espera
    (salon_id, client_id, professional_id, de, ate, hora_de, hora_ate, origem)
  values (p_salon_id, p_client_id, p_professional_id,
          greatest(p_de, v_hoje), p_ate, p_hora_de, p_hora_ate, p_origem)
  returning id into v_id;

  insert into public.fila_de_espera_servicos (fila_id, service_id, ordem)
  select v_id, u.sid, u.ord
    from (select distinct on (sid) sid, ord
            from unnest(p_service_ids) with ordinality as u(sid, ord)
           order by sid, ord) u;

  return jsonb_build_object('ok', true, 'fila_id', v_id,
    'de', greatest(p_de, v_hoje), 'ate', p_ate);
end;
$function$;

revoke all on function public.entrar_na_fila(uuid, uuid, uuid[], date, date, time, time, uuid, text)
  from public, anon;
grant execute on function public.entrar_na_fila(uuid, uuid, uuid[], date, date, time, time, uuid, text)
  to authenticated, service_role;

------------------------------------------------------------------------------
-- 1. Encerrar inscrição vencida
------------------------------------------------------------------------------
create or replace function private.encerrar_fila_vencida()
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with vencidas as (
    update public.fila_de_espera
       set status = 'expirou', encerrada_em = now()
     where status = 'esperando'
       and ate < (now() at time zone 'America/Sao_Paulo')::date
    returning 1
  )
  select count(*)::int from vencidas
$function$;

revoke all on function private.encerrar_fila_vencida() from public, anon, authenticated;
grant execute on function private.encerrar_fila_vencida() to service_role;

comment on function private.encerrar_fila_vencida() is
  'Encerra inscricao cuja faixa de dias ja passou. Limpeza: sem isto a fila cresce com gente que esperava sabado passado, e a tela do dono fica um cemiterio.';

------------------------------------------------------------------------------
-- 2. Devolver para a fila quem foi chamado e não respondeu
------------------------------------------------------------------------------
create or replace function private.devolver_chamados_sem_resposta(
  p_limite_de_chamadas smallint default 2
)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- `chamado` com appointment_id NULO = a varredura expirar_reservas apagou a
  -- reserva, ou seja: foi chamado e nao respondeu no prazo. Nao e
  -- inconsistencia; e o sinal.
  with mexidas as (
    update public.fila_de_espera f
       set chamadas = f.chamadas + 1,
           status = case when f.chamadas + 1 >= p_limite_de_chamadas
                         then 'expirou' else 'esperando' end,
           encerrada_em = case when f.chamadas + 1 >= p_limite_de_chamadas
                               then now() else null end,
           chamada_em = null
     where f.status = 'chamado'
       and f.appointment_id is null
    returning 1
  )
  select count(*)::int from mexidas
$function$;

revoke all on function private.devolver_chamados_sem_resposta(smallint)
  from public, anon, authenticated;
grant execute on function private.devolver_chamados_sem_resposta(smallint) to service_role;

comment on function private.devolver_chamados_sem_resposta(smallint) is
  'Quem foi chamado e nao respondeu volta para a fila com chamadas+1; na segunda, encerra. Uma chamada perdida nao despeja ninguem (a pessoa podia estar no banho); duas encerram, porque chamar para sempre e spam e cada tentativa prende a vaga por 30 minutos que pertencem a quem esta atras. SEM esta funcao a inscricao ficaria presa em `chamado` para sempre, porque a que chama so enxerga `esperando`.';

------------------------------------------------------------------------------
-- 3. Chamar os próximos
------------------------------------------------------------------------------
-- `drop` antes do `create`: `create or replace` NAO muda nome de parametro de
-- saida (42P13, "cannot change return type"). Num banco novo o drop e no-op; em
-- producao ele existe porque a primeira versao desta mesma migration nasceu com
-- a coluna chamada `appointment_id`, que sombreava a coluna homonima dentro do
-- corpo.
drop function if exists private.chamar_proximos_da_fila(integer, integer);

create function private.chamar_proximos_da_fila(
  p_limite integer default 20,
  p_minutos_de_reserva integer default 30
)
returns table (
  fila_id uuid,
  salon_id uuid,
  barbearia text,
  client_id uuid,
  cliente text,
  telefone text,
  -- `reserva_id`, e nao `appointment_id`: nome de coluna de saida em `returns
  -- table` vira VARIAVEL dentro do corpo e sombreia a coluna homonima. Com
  -- `appointment_id` aqui, o `on conflict (appointment_id, service_id)` do
  -- insert abaixo levantava 42702 (referencia ambigua) -- pego rodando, nao
  -- lendo. De quebra o nome ficou mais honesto: o que volta e a RESERVA.
  reserva_id uuid,
  profissional text,
  data_local text,
  hora_local text,
  reservada_ate timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_f record;
  v_minutos int;
  v_quem uuid[];
  v_dia date;
  v_vaga record;
  v_ag uuid;
  v_chamados int := 0;
begin
  for v_f in
    select f.id, f.salon_id, f.client_id, f.professional_id, f.de, f.ate,
           f.hora_de, f.hora_ate
      from public.fila_de_espera f
     where f.status = 'esperando'
     order by f.criada_em
     limit p_limite
  loop
    -- A duracao do que ela espera fazer.
    select sum(s.duracao_minutos)::int into v_minutos
      from public.fila_de_espera_servicos fs
      join public.services s on s.id = fs.service_id and s.ativo
     where fs.fila_id = v_f.id;

    -- Servico desativado depois da inscricao: ela nao casa com nada. Deixa para
    -- o dono resolver na tela em vez de encerrar por conta propria -- quem
    -- desativou o servico foi a barbearia, nao o cliente.
    if coalesce(v_minutos, 0) <= 0 then
      continue;
    end if;

    -- Quem faz TODOS os servicos dela (regua da 0199; lista vazia = faz todos).
    select array_agg(p.id) into v_quem
      from public.professionals p
     where p.salon_id = v_f.salon_id
       and p.ativo
       and (v_f.professional_id is null or p.id = v_f.professional_id)
       and (
         not exists (select 1 from public.professional_services x
                      where x.professional_id = p.id)
         or not exists (
              select 1 from public.fila_de_espera_servicos fs
               where fs.fila_id = v_f.id
                 and not exists (select 1 from public.professional_services x
                                  where x.professional_id = p.id
                                    and x.service_id = fs.service_id))
       );

    if v_quem is null or array_length(v_quem, 1) = 0 then
      continue;
    end if;

    v_ag := null;

    -- Dia por dia, do primeiro ao ultimo da faixa. Para numa vaga que entre.
    for v_dia in
      select g::date
        from generate_series(greatest(v_f.de, v_hoje)::timestamp,
                             v_f.ate::timestamp, interval '1 day') g
    loop
      exit when v_ag is not null;

      for v_vaga in
        select h.professional_id, h.profissional, h.inicio, h.hora_local
          from public.horarios_livres(v_f.salon_id, v_dia, v_minutos,
                                      v_f.professional_id) h
         where h.professional_id = any(v_quem)
           and (v_f.hora_de is null
                or (h.inicio at time zone v_tz)::time >= v_f.hora_de)
           and (v_f.hora_ate is null
                or ((h.inicio + make_interval(mins => v_minutos))
                     at time zone v_tz)::time <= v_f.hora_ate)
         order by h.inicio
         limit 5
      loop
        begin
          -- `data_hora_fim` vai EXPLICITO, como no agendar_pelo_agente. O
          -- trigger calcula_fim_do_agendamento deriva o fim do servico
          -- PRINCIPAL, e a inscricao pode ter dois: a vaga foi validada para
          -- corte+barba (50 min) e a reserva nasceria de 30, liberando meia
          -- hora que nao existe para a proxima pessoa da fila.
          insert into public.appointments
            (salon_id, client_id, professional_id, service_id,
             data_hora_inicio, data_hora_fim, status, origem, reservada_ate)
          select v_f.salon_id, v_f.client_id, v_vaga.professional_id,
                 (select fs.service_id from public.fila_de_espera_servicos fs
                   where fs.fila_id = v_f.id order by fs.ordem limit 1),
                 v_vaga.inicio,
                 v_vaga.inicio + make_interval(mins => v_minutos),
                 'reservado', 'fila',
                 now() + make_interval(mins => p_minutos_de_reserva)
          returning id into v_ag;

          -- Os demais servicos da inscricao. O principal ja foi espelhado pelo
          -- trigger trg_espelha_servico_principal, e por isso o `on conflict`:
          -- reinserir levantaria 23505 e derrubaria a chamada inteira.
          insert into public.appointment_services (appointment_id, service_id, ordem)
          select v_ag, fs.service_id, fs.ordem
            from public.fila_de_espera_servicos fs
           where fs.fila_id = v_f.id
          on conflict (appointment_id, service_id) do nothing;

          exit;
        exception when sqlstate '23P01' then
          -- Trava por CLIENTE: ele ja tem horario exatamente nessa hora. Tenta a
          -- proxima vaga -- desistir da inscricao por causa disso seria punir
          -- quem esperou.
          v_ag := null;
        end;
      end loop;
    end loop;

    if v_ag is null then
      continue;
    end if;

    update public.fila_de_espera
       set status = 'chamado', chamada_em = now(), appointment_id = v_ag
     where id = v_f.id;

    v_chamados := v_chamados + 1;

    return query
    select v_f.id, v_f.salon_id, s.nome, v_f.client_id, c.nome, c.telefone,
           a.id, p.nome,
           to_char(a.data_hora_inicio at time zone v_tz, 'DD/MM'),
           to_char(a.data_hora_inicio at time zone v_tz, 'HH24:MI'),
           a.reservada_ate
      from public.appointments a
      join public.salons s on s.id = a.salon_id
      join public.clients c on c.id = a.client_id
      join public.professionals p on p.id = a.professional_id
     where a.id = v_ag;
  end loop;
end;
$function$;

revoke all on function private.chamar_proximos_da_fila(integer, integer)
  from public, anon, authenticated;
grant execute on function private.chamar_proximos_da_fila(integer, integer) to service_role;

------------------------------------------------------------------------------
-- A fachada que o n8n chama
------------------------------------------------------------------------------
create or replace function public.rodar_a_fila(
  p_limite integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_vencidas int;
  v_devolvidas int;
  v_chamadas jsonb;
begin
  v_vencidas := private.encerrar_fila_vencida();
  v_devolvidas := private.devolver_chamados_sem_resposta();

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_chamadas
    from private.chamar_proximos_da_fila(p_limite) c;

  return jsonb_build_object(
    'vencidas', v_vencidas,
    'devolvidas', v_devolvidas,
    'chamadas', v_chamadas);
end;
$function$;

revoke all on function public.rodar_a_fila(integer) from public, anon, authenticated;
grant execute on function public.rodar_a_fila(integer) to service_role;

comment on function public.rodar_a_fila(integer) is
  'O tique da fila, para o n8n: encerra inscricao vencida, devolve quem foi chamado e nao respondeu, e chama os proximos. A ORDEM importa -- sem devolver antes de chamar, inscricao em `chamado` ficaria presa para sempre, porque a que chama so enxerga `esperando`. Devolve as chamadas a fazer com cliente, telefone, barbeiro, dia, hora e o prazo da reserva. Fachada em public porque o PostgREST so alcanca public (licao da 0197).';

notify pgrst, 'reload schema';
