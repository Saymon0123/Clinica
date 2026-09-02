-- 0125: horário mal preenchido não derruba mais a agenda (roteiro, passo 1.5)
--
-- Achado 5 da revisão de 01/09. A tela validava `fecha <= abre`; com `abre`
-- vazio a comparação passa ('19:00' <= '' é falso), e o jsonb gravava
-- `{"abre": "", "fecha": "19:00"}`. Aí `(h.value->>'abre')::time` estourava
-- 22007 (invalid input syntax for type time) e a RPC inteira falhava — a
-- agenda pública e o agendamento pelo agente devolviam erro naquele dia da
-- semana, para sempre, sem nada na tela indicando a causa.
--
-- A tela passa a exigir os dois campos (correção principal). Aqui vai a
-- defesa de profundidade: valor que não é hora faz o dia ser tratado como
-- FECHADO, em vez de derrubar a consulta. Barbearia sem horário oferece zero
-- horários; barbearia com horário quebrado num dia continua funcionando nos
-- outros.
create or replace function public.horarios_livres(p_salon_id uuid, p_data date, p_duracao_minutos integer, p_professional_id uuid DEFAULT NULL::uuid)
returns table(professional_id uuid, profissional text, inicio timestamp with time zone, hora_local text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with fuso as (select 'America/Sao_Paulo'::text as tz),
  config as (
    select coalesce(folga_entre_atendimentos_minutos, 0) as folga
      from public.salons where id = p_salon_id
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
  ),

  -- Origem 1: a grade regular, agora de 10 em 10 minutos.
  na_grade as (
    select j.professional_id, j.nome, j.hora_fim,
           (t at time zone f.tz) as inicio
      from jornada j
     cross join fuso f
     cross join lateral generate_series(
       (p_data + j.hora_inicio)::timestamp,
       (p_data + j.hora_fim)::timestamp - make_interval(mins => p_duracao_minutos),
       interval '10 minutes'
     ) as t
  ),

  -- Origem 2: logo depois de cada atendimento que ja existe, respeitada a folga.
  --
  -- E o que elimina o desperdicio de verdade. Um corte de 40 minutos comecando
  -- as 10:00 termina as 10:40, e nenhuma grade regular tem 10:40 -- entao o
  -- proximo oferecido seria 10:50, jogando dez minutos fora. Em oito
  -- atendimentos no dia, e mais de uma hora de cadeira que ninguem consegue
  -- comprar.
  --
  -- Ancorar no fim real faz o buraco oferecido ser sempre o buraco que existe.
  apos_atendimento as (
    select j.professional_id, j.nome, j.hora_fim,
           a.data_hora_fim + make_interval(mins => cfg.folga) as inicio
      from jornada j
      join public.appointments a
        on a.professional_id = j.professional_id
       and a.status not in ('cancelado', 'faltou')
     cross join config cfg
     cross join fuso f
     where (a.data_hora_inicio at time zone f.tz)::date = p_data
  ),

  candidatos as (
    select professional_id, nome, hora_fim, inicio from na_grade
    union
    select professional_id, nome, hora_fim, inicio from apos_atendimento
  ),

  -- O horario do salao NAQUELE dia, ja convertido. O cast mora no SELECT e o
  -- filtro de formato no WHERE: o WHERE roda antes, entao valor invalido nunca
  -- chega ao ::time. Dia mal preenchido some daqui e vira "fechado" -- em vez
  -- de estourar 22007 e derrubar a consulta inteira (achado 5).
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
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = c.professional_id
          and a.status not in ('cancelado', 'faltou')
          and tstzrange(
                c.inicio - make_interval(mins => cfg.folga),
                c.inicio + make_interval(mins => p_duracao_minutos) + make_interval(mins => cfg.folga)
              ) && tstzrange(a.data_hora_inicio, a.data_hora_fim)
     )
   order by c.inicio, c.nome;
$function$;
