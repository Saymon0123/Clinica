-- A agenda pública em passos: serviço, barbeiro, horário.
--
-- O dono olhou a agenda pública em 08/10 e disse que ela mostrava horários
-- demais. Estava certo, e a causa era concreta: cada horário aparecia UMA VEZ
-- POR BARBEIRO, de dez em dez minutos -- 84 botões só de manhã, com cinco
-- barbeiros. O desenho decidido com ele:
--
--   serviço  ->  barbeiro (com "qualquer um")  ->  horário de 30 em 30  ->  dados
--
-- O barbeiro vem ANTES do horário a pedido do dono, por causa de quem tem
-- barbeiro fixo: com o horário primeiro, quem quer o Diego tenta 10h, 10h30,
-- 11h até achar uma em que ele esteja. A página antiga dizia o contrário --
-- "escolher o barbeiro primeiro e descobrir que ele está cheio é porta
-- fechada" -- e o risco é real. Por isso cada barbeiro vem com o PRÓXIMO
-- horário livre dele: ninguém escolhe às cegas.
--
-- O QUE ESTA MIGRATION FAZ
--
-- 1. `horarios_livres` ganha PASSO e ENCAIXE opcionais. Os padrões (10 minutos,
--    com encaixe) reproduzem o comportamento de antes -- e isso foi CONFERIDO
--    no ensaio, comparando a saída antiga e a nova para todas as barbearias,
--    catorze dias e três durações. Sete funções do banco chamam esta; nenhuma
--    muda de resultado. A agenda pública pede 30 minutos SEM encaixe: o encaixe
--    oferece 9h40 quando um corte termina às 9h40, e com cinco barbeiros isso
--    trazia de volta os horários quebrados que o dono quer tirar da tela. Quem
--    continua tapando esses buracos é o agente e o balcão (decisão do dono).
--
-- 2. QUEM FAZ O QUÊ (`barbeiros_que_fazem_os_servicos`). A 0199 ensinou o
--    agente a não oferecer barbeiro que não faz o serviço; a agenda pública
--    nunca aprendeu. Na El Corte não aparecia porque os cinco fazem os oito
--    serviços -- mas numa barbearia em que só um faz luzes, a agenda pública
--    ofereceria qualquer um para luzes. A régua é a MESMA do agente, palavra
--    por palavra, inclusive "lista vazia = faz todos".
--
-- 3. "QUALQUER UM" (`private.carga_do_dia`). Regra do dono: fica com quem tem
--    MENOS AGENDAMENTOS NO DIA; empate, quem tem menos minutos ocupados;
--    empate de novo, sorteio. Mora no banco, e não na tela, para o agente do
--    WhatsApp poder usar a mesma regra depois.
--
-- 4. As duas RPCs da agenda pública: `agenda_publica_horarios` (barbeiros com o
--    próximo horário, a faixa de catorze dias e os horários do dia) e
--    `agenda_publica_candidatos` (a ordem em que a edge tenta gravar um
--    "qualquer um" -- se a vaga do primeiro sumir no meio, vai para o segundo
--    em vez de devolver erro ao cliente).
--
-- 5. A trava de quem faz o quê na porta de MUDAR SERVIÇOS
--    (`alterar_servicos_pelo_cliente`). Ela serve ao link de gestão E ao
--    agente, então os dois ganham a trava juntos.
--
-- CORREÇÃO DO QUE A 0217 AFIRMOU. Ela diz que só `remarcar_pelo_cliente` grava
-- `remarcado_pelo_cliente_em`. Não é só: a edge `agenda-publica` também grava,
-- no remarcar pelo link (um UPDATE direto). A regra de cobrança continua certa
-- -- é a opção A do dono, "remarcação de horário que nasceu no agente cobra,
-- por qualquer porta" -- e o barbeiro arrastando o horário na grade continua
-- sem cobrar. Só a frase estava incompleta.

-- ---------------------------------------------- 1) horarios_livres parametrizada
--
-- DROP + CREATE porque acrescentar parâmetro muda a identidade da função: um
-- `create or replace` deixaria DUAS versões convivendo, e toda chamada com cinco
-- argumentos passaria a dar "function is not unique". O corpo é o de produção
-- (conferido em 08/10) com três mudanças, marcadas com 0218.

drop function if exists public.horarios_livres(uuid, date, integer, uuid, uuid);

create or replace function public.horarios_livres(
  p_salon_id uuid,
  p_data date,
  p_duracao_minutos integer,
  p_professional_id uuid default null,
  p_ignorar_agendamento uuid default null,
  p_passo_minutos integer default 10,
  p_com_encaixe boolean default true
)
returns table(professional_id uuid, profissional text, inicio timestamp with time zone, hora_local text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with fuso as (select 'America/Sao_Paulo'::text as tz),
  config as (
    select coalesce(folga_entre_atendimentos_minutos, 0) as folga
      from public.salons where id = p_salon_id
  ),
  -- 0218: o passo da grade. Fora de uma faixa sã volta para 10, em vez de
  -- quebrar o generate_series (passo zero é erro) ou esvaziar a grade calado.
  passo as (
    select case when p_passo_minutos between 5 and 120 then p_passo_minutos else 10 end as minutos
  ),
  jornada as (
    select ps.professional_id, p.nome, ps.hora_inicio, ps.hora_fim
      from public.professional_schedules ps
      join public.professionals p on p.id = ps.professional_id
     where p.salon_id = p_salon_id
       and p.ativo
       and ps.ativo
       and ps.dia_semana = extract(dow from p_data)
       and (p_professional_id is null or ps.professional_id = p_professional_id)
       -- A folga do dia tira o barbeiro da jornada, e com ela desaparecem as
       -- DUAS origens de candidato (a grade e o encaixe pós-atendimento), que
       -- nascem daqui. A jornada é semanal; a folga é por data.
       and not exists (
         select 1 from public.dias_de_folga df
          where df.professional_id = ps.professional_id
            and df.dia = p_data
       )
  ),
  na_grade as (
    select j.professional_id, j.nome, j.hora_fim,
           (t at time zone f.tz) as inicio
      from jornada j
     cross join fuso f
     cross join passo pa
     cross join lateral generate_series(
       -- 0218: a grade começa no primeiro múltiplo do passo contado da
       -- meia-noite, e não no minuto exato em que a jornada começa. Com passo
       -- 10 e jornada às 9h é o MESMO instante (e toda jornada de produção
       -- começa em hora cheia -- conferido); com passo 30, é o que impede um
       -- barbeiro que entra às 9h15 de sumir da agenda pública inteira, porque
       -- a grade dele nunca cairia em :00 ou :30.
       p_data + make_interval(
         mins => (ceil(extract(epoch from j.hora_inicio) / 60.0 / pa.minutos) * pa.minutos)::int
       ),
       (p_data + j.hora_fim)::timestamp - make_interval(mins => p_duracao_minutos),
       make_interval(mins => pa.minutos)
     ) as t
  ),
  apos_atendimento as (
    -- Depois de um bloqueio a vaga começa no minuto seguinte.
    select j.professional_id, j.nome, j.hora_fim,
           a.data_hora_fim + make_interval(
             mins => case when a.status = 'bloqueio' then 0 else cfg.folga end
           ) as inicio
      from jornada j
      join public.appointments a
        on a.professional_id = j.professional_id
       and a.status not in ('cancelado', 'faltou')
       and a.id is distinct from p_ignorar_agendamento
     cross join config cfg
     cross join fuso f
     where (a.data_hora_inicio at time zone f.tz)::date = p_data
       -- 0218: a agenda pública pede a grade limpa, sem o encaixe.
       and coalesce(p_com_encaixe, true)
  ),
  candidatos as (
    select professional_id, nome, hora_fim, inicio from na_grade
    union
    select professional_id, nome, hora_fim, inicio from apos_atendimento
  ),
  horario_do_dia as (
    select (h.value->>'abre')::time as abre,
           (h.value->>'fecha')::time as fecha
      from public.salons s
      cross join lateral jsonb_each(s.horario_funcionamento) h
     where s.id = p_salon_id
       and s.ativo
       and h.key = case extract(dow from p_data)
                     when 0 then 'dom' when 1 then 'seg' when 2 then 'ter'
                     when 3 then 'qua' when 4 then 'qui' when 5 then 'sex'
                     else 'sab' end
       and h.value ? 'abre'
       and (h.value->>'abre') ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (h.value->>'fecha') ~ '^[0-9]{1,2}:[0-9]{2}$'
  )
  select c.professional_id,
         c.nome,
         c.inicio,
         to_char(c.inicio at time zone f.tz, 'HH24:MI') as hora_local
    from candidatos c
   cross join fuso f
   cross join config cfg
   where c.inicio > now() + interval '10 minutes'
     and ((c.inicio + make_interval(mins => p_duracao_minutos)) at time zone f.tz)::time <= c.hora_fim
     and (c.inicio at time zone f.tz)::time >= (
           select ps.hora_inicio from public.professional_schedules ps
            where ps.professional_id = c.professional_id
              and ps.ativo and ps.dia_semana = extract(dow from p_data) limit 1
         )
     and exists (
       select 1 from horario_do_dia hd
        where (c.inicio at time zone f.tz)::time >= hd.abre
          and ((c.inicio + make_interval(mins => p_duracao_minutos)) at time zone f.tz)::time
              <= hd.fecha
     )
     -- A folga mudou de lado: agora alarga o VIZINHO, porque só assim ela pode
     -- ser zero quando o vizinho é um bloqueio.
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = c.professional_id
          and a.status not in ('cancelado', 'faltou')
          and a.id is distinct from p_ignorar_agendamento
          and tstzrange(c.inicio, c.inicio + make_interval(mins => p_duracao_minutos))
              && tstzrange(
                   a.data_hora_inicio - make_interval(
                     mins => case when a.status = 'bloqueio' then 0 else cfg.folga end),
                   a.data_hora_fim + make_interval(
                     mins => case when a.status = 'bloqueio' then 0 else cfg.folga end)
                 )
     )
   order by c.inicio, c.nome;
$fn$;

-- O trinco de antes, reposto à mão: só postgres e service_role executavam.
revoke all on function public.horarios_livres(uuid, date, integer, uuid, uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.horarios_livres(uuid, date, integer, uuid, uuid, integer, boolean)
  to service_role;

-- ------------------------------------------------------- 2) Quem faz o quê
--
-- A régua de `horarios_livres_pelo_agente` (0199), palavra por palavra: faz
-- TODOS os serviços pedidos, e quem não tem NENHUM serviço ligado conta como
-- "faz todos" -- filtrar ao pé da letra o faria desaparecer da agenda sem
-- explicação. O pgTAP desta migration confere que as duas portas concordam.

create or replace function public.barbeiros_que_fazem_os_servicos(
  p_salon_id uuid,
  p_service_ids uuid[]
)
returns uuid[]
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(array_agg(p.id order by p.nome, p.id), '{}'::uuid[])
    from public.professionals p
   where p.salon_id = p_salon_id
     and p.ativo
     and (
       not exists (select 1 from public.professional_services x
                    where x.professional_id = p.id)
       or not exists (
            select 1 from (select distinct sid from unnest(p_service_ids) as sid) d
             where not exists (select 1 from public.professional_services x
                                where x.professional_id = p.id
                                  and x.service_id = d.sid))
     );
$fn$;

revoke all on function public.barbeiros_que_fazem_os_servicos(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.barbeiros_que_fazem_os_servicos(uuid, uuid[])
  to service_role;

-- ------------------------------------------- 3) A duração, validada uma vez só

create or replace function private.duracao_dos_servicos(p_salon_id uuid, p_service_ids uuid[])
returns integer
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_qtd int;
  v_minutos int;
begin
  if p_salon_id is null then
    raise exception 'Faltou o salao.' using errcode = '22023';
  end if;
  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  select count(*) into v_qtd
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s
      on s.id = d.sid and s.salon_id = p_salon_id and s.ativo;
  if v_qtd <> (select count(distinct sid) from unnest(p_service_ids) as sid) then
    raise exception 'Servico de outro salao, inativo ou inexistente.' using errcode = '22023';
  end if;

  select sum(s.duracao_minutos) into v_minutos
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid;
  if coalesce(v_minutos, 0) <= 0 then
    raise exception 'Servico sem duracao cadastrada.' using errcode = '22023';
  end if;
  return v_minutos;
end;
$fn$;

revoke all on function private.duracao_dos_servicos(uuid, uuid[]) from public, anon, authenticated;

-- ----------------------------------------------- 4) A carga do dia ("qualquer um")
--
-- Quanto cada barbeiro já tem NAQUELE dia. Agendamento é o que ocupa a cadeira
-- com cliente: cancelado, falta e bloqueio de agenda não contam. O horário que
-- está sendo remarcado também não -- senão o barbeiro atual seria punido pelo
-- próprio horário que o cliente quer mover.

create or replace function private.carga_do_dia(
  p_salon_id uuid,
  p_dia date,
  p_ignorar_agendamento uuid default null
)
returns table(professional_id uuid, agendamentos integer, minutos integer)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select p.id,
         count(a.id)::int,
         coalesce(sum(extract(epoch from (a.data_hora_fim - a.data_hora_inicio)) / 60), 0)::int
    from public.professionals p
    left join public.appointments a
      on a.professional_id = p.id
     and a.status not in ('cancelado', 'faltou', 'bloqueio')
     and a.id is distinct from p_ignorar_agendamento
     and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date = p_dia
   where p.salon_id = p_salon_id
   group by p.id;
$fn$;

revoke all on function private.carga_do_dia(uuid, date, uuid) from public, anon, authenticated;

-- ------------------------------------------------- 5) O que a página mostra
--
-- Uma chamada, três respostas, tiradas da MESMA conta de vagas para não
-- discordarem entre si:
--
--   barbeiros  quem faz os serviços, cada um com o próximo horário livre
--              (nulo = sem vaga na janela, e a tela diz isso em vez de esconder);
--   dias       quantos horários sobram em cada dia, para a escolha feita;
--   horarios   os horários do dia pedido, UM por linha. Com "qualquer um", cada
--              linha traz o barbeiro que a régua escolheria agora -- é o nome
--              que a tela mostra antes de a pessoa confirmar.
--
-- `p_escolha` nula devolve só os barbeiros: é o passo em que a pessoa ainda não
-- escolheu. 'qualquer' ou o uuid do barbeiro liberam dias e horários.
--
-- VOLÁTIL, não estável: o desempate é sorteio, e `random()` não combina com a
-- promessa de "mesmo resultado na mesma instrução".

create or replace function public.agenda_publica_horarios(
  p_salon_id uuid,
  p_service_ids uuid[],
  p_escolha text default null,
  p_data date default null,
  p_dias integer default 14,
  p_ignorar_agendamento uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_hoje date := (now() at time zone v_tz)::date;
  v_data date := coalesce(p_data, (now() at time zone v_tz)::date);
  v_dias int := least(greatest(coalesce(p_dias, 14), 1), 31);
  v_escolha text := nullif(btrim(coalesce(p_escolha, '')), '');
  v_minutos int;
  v_quem uuid[];
  v_alvo uuid[];
  v_resultado jsonb;
begin
  v_minutos := private.duracao_dos_servicos(p_salon_id, p_service_ids);
  v_quem := public.barbeiros_que_fazem_os_servicos(p_salon_id, p_service_ids);

  if v_escolha is null then
    v_alvo := null;
  elsif v_escolha = 'qualquer' then
    v_alvo := v_quem;
  elsif v_escolha ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if not (v_escolha::uuid = any(v_quem)) then
      -- Recusa de negócio vira conversa, não exceção: o barbeiro pode ter
      -- deixado de fazer o serviço entre a pessoa abrir a página e tocar nele.
      return jsonb_build_object('ok', false,
        'motivo', 'Esse barbeiro nao faz esse servico.');
    end if;
    v_alvo := array[v_escolha::uuid];
  else
    raise exception 'Escolha invalida.' using errcode = '22023';
  end if;

  with janela as (
    select (v_hoje + g)::date as dia from generate_series(0, v_dias - 1) g
  ),
  vagas as (
    select j.dia, h.professional_id, h.profissional, h.inicio, h.hora_local
      from janela j
      cross join lateral public.horarios_livres(
        p_salon_id, j.dia, v_minutos, null, p_ignorar_agendamento, 30, false) h
     where h.professional_id = any(v_quem)
  ),
  barbeiros as (
    select p.id, p.nome,
           (select min(v.inicio) from vagas v where v.professional_id = p.id) as proximo
      from public.professionals p
     where p.id = any(v_quem)
  ),
  carga as (
    select * from private.carga_do_dia(p_salon_id, v_data, p_ignorar_agendamento)
  ),
  do_dia as (
    select distinct on (v.inicio) v.inicio, v.hora_local, v.professional_id, v.profissional
      from vagas v
      join carga c on c.professional_id = v.professional_id
     where v.dia = v_data
       and v.professional_id = any(v_alvo)
     order by v.inicio, c.agendamentos, c.minutos, random()
  ),
  contagem as (
    select j.dia,
           (select count(distinct v.inicio) from vagas v
             where v.dia = j.dia and v.professional_id = any(v_alvo))::int as livres
      from janela j
  )
  select jsonb_build_object(
    'ok', true,
    'duracao', v_minutos,
    'escolha', v_escolha,
    'data', v_data,
    -- Quem tem vaga primeiro, por nome; quem não tem fica no fim, por nome.
    -- Por nome e não pela vaga mais cedo: quem tem barbeiro fixo procura o
    -- NOME na lista, e uma ordem que muda a cada consulta o faria procurar de
    -- novo a cada toque.
    'barbeiros', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'nome', b.nome, 'proximo', b.proximo)
                       order by (b.proximo is null), b.nome)
        from barbeiros b), '[]'::jsonb),
    'dias', case when v_alvo is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('dia', c.dia, 'livres', c.livres) order by c.dia)
        from contagem c), '[]'::jsonb) end,
    'horarios', case when v_alvo is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'inicio', d.inicio, 'hora_local', d.hora_local,
               'professional_id', d.professional_id, 'profissional', d.profissional)
             order by d.inicio)
        from do_dia d), '[]'::jsonb) end
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

revoke all on function public.agenda_publica_horarios(uuid, uuid[], text, date, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.agenda_publica_horarios(uuid, uuid[], text, date, integer, uuid)
  to service_role;

-- ----------------------------------------- 6) A ordem de tentativa do "qualquer um"
--
-- Quem está livre NAQUELE instante e faz os serviços, na ordem da régua. O
-- `p_preferido` é o nome que a tela mostrou antes da confirmação: se ele ainda
-- estiver livre, fica com ele -- a pessoa leu "com o Rafael" e confirmou, e
-- trocar por uma diferença de carga que surgiu nesses segundos seria quebrar a
-- palavra por quase nada. Só quando ele não está mais livre a régua decide.

create or replace function public.agenda_publica_candidatos(
  p_salon_id uuid,
  p_inicio timestamptz,
  p_service_ids uuid[],
  p_preferido uuid default null,
  p_ignorar_agendamento uuid default null
)
returns table(professional_id uuid, profissional text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
#variable_conflict use_column
declare
  v_dia date;
  v_minutos int;
  v_quem uuid[];
begin
  if p_inicio is null then
    raise exception 'Faltou o horario.' using errcode = '22023';
  end if;
  v_minutos := private.duracao_dos_servicos(p_salon_id, p_service_ids);
  v_quem := public.barbeiros_que_fazem_os_servicos(p_salon_id, p_service_ids);
  v_dia := (p_inicio at time zone 'America/Sao_Paulo')::date;

  return query
    select h.professional_id, h.profissional
      from public.horarios_livres(
             p_salon_id, v_dia, v_minutos, null, p_ignorar_agendamento, 30, false) h
      join private.carga_do_dia(p_salon_id, v_dia, p_ignorar_agendamento) c
        on c.professional_id = h.professional_id
     where h.inicio = p_inicio
       and h.professional_id = any(v_quem)
     order by case when h.professional_id = p_preferido then 0 else 1 end,
              c.agendamentos, c.minutos, random();
end;
$fn$;

revoke all on function public.agenda_publica_candidatos(uuid, timestamptz, uuid[], uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agenda_publica_candidatos(uuid, timestamptz, uuid[], uuid, uuid)
  to service_role;

-- ------------------------------- 7) Quem faz o quê na porta de mudar serviços
--
-- O corpo é o de produção (conferido em 08/10), com UM bloco novo, marcado 0218.
-- `create or replace` com a mesma assinatura mantém os grants.

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
as $fn$
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
  v_nao_faz text;
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

  -- 0218: QUEM FAZ O QUÊ. Só o serviço NOVO é conferido: o que já está no
  -- agendamento fica, mesmo que o cadastro do barbeiro tenha mudado depois --
  -- recusar o que ele próprio já aceitou travaria qualquer outra mudança,
  -- inclusive a de TIRAR um serviço.
  select string_agg(s.nome, ', ' order by s.nome) into v_nao_faz
    from (select distinct sid from unnest(p_service_ids) as sid) d
    join public.services s on s.id = d.sid
   where not exists (select 1 from public.appointment_services asv
                      where asv.appointment_id = v_ag.id
                        and asv.service_id = d.sid)
     and not (v_ag.professional_id = any(
           public.barbeiros_que_fazem_os_servicos(v_ag.salon_id, array[d.sid])));
  if v_nao_faz is not null then
    return jsonb_build_object('ok', false,
      'motivo', format('%s nao faz %s. Para incluir, remarque com outro barbeiro ou fale com a barbearia.',
                       coalesce((select p.nome from public.professionals p
                                  where p.id = v_ag.professional_id), 'Esse barbeiro'),
                       v_nao_faz));
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
$fn$;

-- ------------------------------------------------------------ 8) A documentação
--
-- O DROP do passo 1 levou junto o comentário que a 0169 tinha deixado em
-- `horarios_livres` -- calado, como o `create or replace` de view faz com o que
-- não foi redigitado. Volta aqui, com os dois parâmetros novos. O pgTAP desta
-- migration confere que ele continua existindo.

comment on function public.horarios_livres(uuid, date, integer, uuid, uuid, integer, boolean) is
  'Horarios livres de um dia. p_ignorar_agendamento (0169) existe para REMARCAR: sem ele, o agendamento que esta sendo movido bloqueia os horarios proximos ao proprio, e quem quer sair das 10:00 para as 10:20 nao ve as 10:20. p_passo_minutos e p_com_encaixe (0218): a agenda publica pede 30 minutos sem encaixe; o padrao (10, com encaixe) e o de sempre, usado pelo agente e pelo balcao.';

comment on function public.barbeiros_que_fazem_os_servicos(uuid, uuid[]) is
  'Quem faz TODOS os servicos pedidos; barbeiro sem nenhum servico ligado conta como faz todos. A mesma regua de horarios_livres_pelo_agente (0199), usada pela agenda publica desde a 0218.';

comment on function public.agenda_publica_horarios(uuid, uuid[], text, date, integer, uuid) is
  'A agenda publica em passos (0218): barbeiros com o proximo horario, a faixa de dias e os horarios de 30 em 30 do dia, todos da mesma conta de vagas. p_escolha: nula (so os barbeiros), qualquer, ou o uuid do barbeiro.';

comment on function public.agenda_publica_candidatos(uuid, timestamptz, uuid[], uuid, uuid) is
  'Ordem de tentativa para gravar um horario da agenda publica (0218): o preferido (o nome que a tela mostrou) se ainda livre; depois menos agendamentos no dia, menos minutos, sorteio.';

notify pgrst, 'reload schema';
