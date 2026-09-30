-- O barbeiro fecha a própria agenda.
--
-- O status `bloqueio` existe no CHECK de `appointments` desde sempre, o tipo do
-- CRM o conhece, o modal de detalhe já o desenha em cinza e a contagem de
-- reservas vivas já o ignora. Só faltava criar um: o `NewAppointmentModal`
-- gravava `agendado` ou `concluido`, e por isso havia ZERO linhas com esse
-- status no banco. Uma porta inteira construída e nunca aberta.
--
-- Abrir a porta não precisaria de migration nenhuma -- a trava de exclusão
-- `appointments_sem_sobreposicao` não isenta `bloqueio`, então no instante em
-- que a linha existe o banco já recusa qualquer agendamento em cima dela, venha
-- do CRM, do link público ou do agente do WhatsApp. `client_id` e `service_id`
-- já aceitam nulo, e a RLS já limita o barbeiro à própria cadeira.
--
-- O que exigiu migration foi a FOLGA.

------------------------------------------------------------------------------
-- 1. O motivo do bloqueio
------------------------------------------------------------------------------
-- Uma semana com seis retângulos cinza escritos "Bloqueio" não diz nada. Com
-- "Almoço", "Médico", "Folga" a agenda volta a ser legível de relance. Fica de
-- fora da vista do cliente: bloqueio nunca aparece na agenda pública nem na
-- conversa do agente -- o horário apenas não é oferecido.
alter table public.appointments
  add column motivo_do_bloqueio text;

alter table public.appointments
  add constraint appointments_motivo_do_bloqueio_tamanho
  check (motivo_do_bloqueio is null or length(motivo_do_bloqueio) <= 60);

comment on column public.appointments.motivo_do_bloqueio is
  'Só para status=bloqueio: "Almoço", "Médico", "Folga". Interno -- o cliente '
  'nunca vê um bloqueio, o horário apenas não é oferecido a ele.';

------------------------------------------------------------------------------
-- 2. A régua: o bloqueio ocupa a cadeira, mas não deve folga
------------------------------------------------------------------------------
-- `salons.folga_entre_atendimentos_minutos` existe para o barbeiro respirar
-- entre dois clientes: varrer o chão, lavar a mão. O bloqueio É a respiração --
-- cobrar folga em volta dele é cobrar descanso de quem não estava aqui.
--
-- Sem esta correção, a primeira coisa que o barbeiro tentasse já falhava: o
-- salão de teste exige 10 minutos, então bloquear o almoço das 12h com um corte
-- terminando às 12h era recusado com "fica a menos de 10 minutos de outro
-- atendimento" -- uma frase que ele leria como defeito do sistema.
--
-- A régua vale nos DOIS lados, e por isso duas funções mudam juntas: o gatilho
-- (que decide se a linha entra) e `horarios_livres` (que decide o que o cliente
-- enxerga). Mexer só no gatilho deixaria o CRM aceitando 13:00 enquanto o link
-- público escondia até 13:10 -- as duas portas discordando sobre a mesma régua,
-- que é exatamente o que este projeto não faz.
create or replace function public.respeita_folga_entre_atendimentos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_folga integer;
  v_vizinho record;
begin
  if new.professional_id is null then return new; end if;
  -- `bloqueio` entrou nesta lista: ele não deve folga a ninguém.
  if new.status in ('cancelado', 'faltou', 'concluido', 'bloqueio') then return new; end if;
  if new.data_hora_inicio <= now() then return new; end if;

  if tg_op = 'UPDATE'
     and new.professional_id = old.professional_id
     and new.data_hora_inicio = old.data_hora_inicio
     and new.data_hora_fim = old.data_hora_fim
     and old.status not in ('cancelado', 'faltou') then
    return new;
  end if;

  select coalesce(s.folga_entre_atendimentos_minutos, 0) into v_folga
    from public.salons s where s.id = new.salon_id;
  if coalesce(v_folga, 0) <= 0 then return new; end if;

  select a.id, a.data_hora_inicio, a.data_hora_fim into v_vizinho
    from public.appointments a
   where a.professional_id = new.professional_id
     and a.id <> new.id
     -- ... e ninguém deve folga a um bloqueio: o cliente das 13h entra colado
     -- no almoço que terminou às 13h.
     and a.status not in ('cancelado', 'faltou', 'bloqueio')
     and tstzrange(new.data_hora_inicio - make_interval(mins => v_folga),
                   new.data_hora_fim + make_interval(mins => v_folga))
         && tstzrange(a.data_hora_inicio, a.data_hora_fim)
   order by a.data_hora_inicio
   limit 1;

  if found then
    raise exception 'Fica a menos de % minutos de outro atendimento do barbeiro (das % às %). A barbearia exige essa folga entre um e outro.',
      v_folga,
      to_char(v_vizinho.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      to_char(v_vizinho.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI')
      using errcode = '23P01';
  end if;

  return new;
end;
$function$;

------------------------------------------------------------------------------
-- 3. A mesma régua na porta do cliente
------------------------------------------------------------------------------
-- Duas mudanças, ambas do mesmo tamanho: onde havia `cfg.folga` fixo, agora há
-- `case when a.status = 'bloqueio' then 0 else cfg.folga end`.
--
-- A segunda delas exigiu virar a comparação do avesso. Antes, a folga alargava
-- o CANDIDATO e media contra o vizinho; como a folga agora depende de QUEM é o
-- vizinho, ela passou para o lado dele. É equivalente: alargar A em f e medir
-- contra B dá o mesmo que alargar B em f e medir contra A -- as duas perguntas
-- são "a distância entre A e B é menor que f?".
create or replace function public.horarios_livres(
  p_salon_id uuid,
  p_data date,
  p_duracao_minutos integer,
  p_professional_id uuid default null,
  p_ignorar_agendamento uuid default null)
returns table(professional_id uuid, profissional text, inicio timestamptz, hora_local text)
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
$function$;

-- O trinco, reposto à mão. `create or replace` preserva os grants de uma função
-- que já existia, mas a casa já foi mordida por isso e conferir custa nada.
--
-- O alvo é o que a função TEM hoje, conferido antes de escrever esta linha:
-- `postgres` e `service_role`, e mais ninguém. Nem `authenticated` -- o CRM não
-- chama esta RPC direto, e a agenda pública chega por edge function. Repetir o
-- estado atual é o ponto: se um `replace` futuro afrouxar, isto reaperta.
revoke all on function public.horarios_livres(uuid, date, integer, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.horarios_livres(uuid, date, integer, uuid, uuid)
  to service_role;
