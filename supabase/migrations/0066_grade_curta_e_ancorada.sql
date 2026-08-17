-- Grade de 10 minutos e candidatos ancorados no fim de cada atendimento.
--
-- A grade era de 15 minutos, escolhida grossa de proposito para a lista do QR
-- não virar um paredão de opções. So que grade fixa desperdica cadeira: um
-- corte de 40 minutos comecando as 10:00 termina as 10:40, e como 10:40 nao e
-- marca de grade, o proximo horario oferecido era 10:50. Dez minutos jogados
-- fora **em cada atendimento** -- em oito cortes no dia, mais de uma hora que
-- ninguem consegue comprar.
--
-- Encurtar a grade sozinho nao resolve, so divide o problema: com 5 minutos o
-- desperdicio cai mas nao zera, e a lista explode. A correcao de verdade e
-- gerar candidatos tambem a partir do **fim real** de cada atendimento, mais a
-- folga. Ai o buraco oferecido e sempre o buraco que existe.
--
-- Medido na Curitiba com um corte de 40 minutos as 10:00 e folga 0: antes o
-- primeiro horario depois dele era 10:50; agora e 10:40.
--
-- Efeito colateral aceito: a lista cresceu (83 horarios num dia de dois
-- barbeiros). A `AgendaPublicaPage` passou a mostrar os 12 primeiros com um
-- "ver mais", porque quem escaneia o QR esta de pe no balcao e quer o mais
-- cedo -- que era o que ficava enterrado.

create or replace function public.horarios_livres(
  p_salon_id uuid,
  p_data date,
  p_duracao_minutos integer,
  p_professional_id uuid default null
)
returns table (
  professional_id uuid,
  profissional text,
  inicio timestamptz,
  hora_local text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
       select 1
       from public.salons s
       cross join lateral jsonb_each(s.horario_funcionamento) h
       where s.id = p_salon_id
         and s.ativo
         and h.key = case extract(dow from p_data)
                       when 0 then 'dom' when 1 then 'seg' when 2 then 'ter'
                       when 3 then 'qua' when 4 then 'qui' when 5 then 'sex'
                       else 'sab' end
         and h.value ? 'abre'
         and (c.inicio at time zone f.tz)::time >= (h.value->>'abre')::time
         and ((c.inicio + make_interval(mins => p_duracao_minutos)) at time zone f.tz)::time
             <= (h.value->>'fecha')::time
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
$$;

comment on function public.horarios_livres(uuid, date, integer, uuid) is
  'Horarios livres por barbeiro num dia. Candidatos vem da grade de 10 minutos E do fim de cada atendimento existente, para nao desperdicar o tempo entre o fim real e a proxima marca da grade. Respeita jornada, horario da barbearia, duracao e folga.';
