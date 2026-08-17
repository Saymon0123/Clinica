-- Folga entre um atendimento e outro.
--
-- Até aqui o sistema encaixava cliente colado em cliente, sem tempo para limpar
-- a cadeira, varrer o chão ou o barbeiro respirar. Numa barbearia que trabalha
-- assim de verdade, o dia atrasa a partir do segundo cliente — e o atraso se
-- acumula, porque nada na agenda tem folga para absorver.
--
-- Por barbearia, e não por serviço: quem decide é o dono, e o motivo (limpar,
-- receber, respirar) é o mesmo para corte e para barba.
--
-- Nasce em **zero**, que é o comportamento anterior. Ninguém tem a agenda
-- alterada sem pedir.
alter table public.salons
  add column if not exists folga_entre_atendimentos_minutos integer not null default 0
  check (folga_entre_atendimentos_minutos between 0 and 60);

comment on column public.salons.folga_entre_atendimentos_minutos is
  'Minutos livres exigidos ANTES e DEPOIS de cada atendimento. Zero mantem o comportamento anterior, colado.';

-- `horarios_livres` passa a respeitar a folga.
--
-- A folga entra **cercando o candidato**, e não alongando o serviço: um corte de
-- 40 minutos continua ocupando 40 minutos na agenda. O que muda é que ele só
-- cabe onde houver folga dos dois lados — senão o último horário do dia sumiria
-- por "não caber a folga depois", com a barbearia já fechada.
--
-- Efeito medido: com um corte de 40 min às 10:00 e folga de 15, somem das
-- opções exatamente 09:30 (terminaria colado) e 10:45 (começaria 5 min depois).
-- 09:15 fica, porque termina 09:45 e deixa os 15 minutos exatos.
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
  candidatos as (
    select j.professional_id,
           j.nome,
           (t at time zone f.tz) as inicio,
           ((t + make_interval(mins => p_duracao_minutos)) at time zone f.tz) as fim,
           j.hora_fim
      from jornada j
     cross join fuso f
     cross join lateral generate_series(
       (p_data + j.hora_inicio)::timestamp,
       (p_data + j.hora_fim)::timestamp - make_interval(mins => p_duracao_minutos),
       interval '15 minutes'
     ) as t
  )
  select c.professional_id,
         c.nome,
         c.inicio,
         to_char(c.inicio at time zone f.tz, 'HH24:MI') as hora_local
    from candidatos c
   cross join fuso f
   cross join config cfg
   where c.inicio > now() + interval '10 minutes'
     and (c.fim at time zone f.tz)::time <= c.hora_fim
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
         and (c.fim    at time zone f.tz)::time <= (h.value->>'fecha')::time
     )
     -- O candidato, cercado pela folga, não pode encostar em nada que já exista.
     -- `faltou` entra junto de `cancelado`: quem não apareceu não ocupa cadeira.
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = c.professional_id
          and a.status not in ('cancelado', 'faltou')
          and tstzrange(
                c.inicio - make_interval(mins => cfg.folga),
                c.fim    + make_interval(mins => cfg.folga)
              ) && tstzrange(a.data_hora_inicio, a.data_hora_fim)
     )
   order by c.inicio, c.nome;
$$;

comment on function public.horarios_livres(uuid, date, integer, uuid) is
  'Horarios livres por barbeiro num dia, respeitando jornada, horario da barbearia, duracao do servico, folga entre atendimentos e o que ja esta marcado. Fonte unica para a pagina publica, o CRM e o agente.';
