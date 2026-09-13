-- 0169: remarcar sem o horário bloquear a si mesmo (etapa 4 do QR v2, servidor).
--
-- O QUE ISTO DESTRAVA. Remarcar é escolher outro horário para o MESMO
-- agendamento — mesmo token, para o link guardado no celular continuar valendo.
-- Mas `horarios_livres` esconde todo horário que colide com um agendamento de
-- pé, e o agendamento que está sendo movido é um deles. Quem tentasse sair das
-- 10:00 para as 10:20, num corte de 40 minutos, não veria as 10:20 na grade:
-- ele mesmo estaria bloqueando.
--
-- `p_ignorar_agendamento` resolve nos dois pontos em que a função olha os
-- agendamentos existentes: o que ancora um horário no fim de um atendimento e o
-- que descarta a sobreposição.
--
-- POR QUE `drop` E NÃO `create or replace`. Parâmetro novo com valor padrão não
-- substitui a função: cria uma SOBRECARGA. As chamadas com quatro argumentos
-- passariam a casar com as duas assinaturas e o PostgreSQL recusaria por
-- ambiguidade — quebrando a agenda pública inteira. Derrubar e recriar é o
-- único caminho.
--
-- QUEM CHAMA, conferido antes de mexer: a edge `agenda-publica` (dois pontos,
-- por RPC) e `dias_com_horario` (migration 0167). O CRM não chama. Ensaiado em
-- produção: com o novo parâmetro ausente, `dias_com_horario` continua devolvendo
-- os catorze dias.
--
-- O TRINCO É REPOSTO À MÃO. Função nova nasce com EXECUTE para `public`; a
-- antiga tinha ACL `postgres=X | service_role=X`. Sem os revokes abaixo, a
-- agenda de qualquer barbearia viraria uma chamada REST direta, sem a edge no
-- meio — sem freio de taxa, sem checagem de `salons_atendendo`, sem
-- `recursos_ativos`.

drop function if exists public.horarios_livres(uuid, date, integer, uuid);

create or replace function public.horarios_livres(
  p_salon_id uuid,
  p_data date,
  p_duracao_minutos integer,
  p_professional_id uuid default null,
  p_ignorar_agendamento uuid default null
)
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

  -- A âncora no fim de cada atendimento (migration 0066). O agendamento que
  -- está sendo movido não ancora nada: ele vai sair dali.
  apos_atendimento as (
    select j.professional_id, j.nome, j.hora_fim,
           a.data_hora_fim + make_interval(mins => cfg.folga) as inicio
      from jornada j
      join public.appointments a
        on a.professional_id = j.professional_id
       and a.status not in ('cancelado', 'faltou')
       and a.id is distinct from p_ignorar_agendamento
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
     -- O agendamento que está sendo movido não colide consigo mesmo.
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = c.professional_id
          and a.status not in ('cancelado', 'faltou')
          and a.id is distinct from p_ignorar_agendamento
          and tstzrange(
                c.inicio - make_interval(mins => cfg.folga),
                c.inicio + make_interval(mins => p_duracao_minutos) + make_interval(mins => cfg.folga)
              ) && tstzrange(a.data_hora_inicio, a.data_hora_fim)
     )
   order by c.inicio, c.nome;
$function$;

comment on function public.horarios_livres(uuid, date, integer, uuid, uuid) is
  'Horarios livres de um dia. p_ignorar_agendamento (0169) existe para REMARCAR: sem ele, o agendamento que esta sendo movido bloqueia os horarios proximos ao proprio, e quem quer sair das 10:00 para as 10:20 nao ve as 10:20.';

revoke execute on function public.horarios_livres(uuid, date, integer, uuid, uuid) from public;
revoke execute on function public.horarios_livres(uuid, date, integer, uuid, uuid) from anon;
revoke execute on function public.horarios_livres(uuid, date, integer, uuid, uuid) from authenticated;
grant execute on function public.horarios_livres(uuid, date, integer, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- O carimbo de "o cliente mudou o horário"
-- ---------------------------------------------------------------------------
-- Serve ao mesmo aviso da Agenda que a 0168 criou para o cancelamento: se o
-- cliente remarcar sozinho e a barbearia não for avisada, o buraco volta pela
-- outra porta -- a cadeira das 10:00 esvaziou e ninguém contou.
--
-- A TELA que consome isto vem no PR seguinte; a coluna entra junto com quem a
-- preenche para não existir edge gravando numa coluna que não existe.
alter table public.appointments
  add column if not exists remarcado_pelo_cliente_em timestamptz;

comment on column public.appointments.remarcado_pelo_cliente_em is
  'Quando o CLIENTE mudou o proprio horario pelo link (etapa 4). Alimenta o aviso da Agenda, junto com cancelado_por. Nulo quando quem mudou foi a barbearia.';
