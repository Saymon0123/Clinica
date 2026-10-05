-- A folga que não colide (item 18, parte 1)
--
-- ## O problema que isto resolve
--
-- "Hoje é dia 4, surge um imprevisto, no dia 7 ele não pode trabalhar — e tem
-- 10 agendamentos." O dono descreveu o caso depois de o bloqueio de dia inteiro
-- passar a funcionar, e o bloqueio não serve aqui: ele É um agendamento
-- (`status='bloqueio'`), então a trava `appointments_sem_sobreposicao` o recusa
-- com 23P01 enquanto houver qualquer horário no caminho.
--
-- O resultado é que **o dia 7 continua enchendo enquanto ele tenta esvaziá-lo**:
-- a agenda pública, o agente, a reativação e a fila seguem oferecendo o dia,
-- porque nada disse a eles que ele fechou. Hoje "fechar para novos" e "resolver
-- os que já existem" são a mesma ação, e só com antecedência isso aparece.
--
-- ## Por que uma tabela, e não mais um status de agendamento
--
-- Porque a folga precisa **conviver** com os agendamentos do dia, e agendamento
-- nenhum convive com outro: a EXCLUDE os separa por definição. Fora de
-- `appointments`, a folga nasce sem travar com nada — o dia para de ser
-- oferecido no instante em que é marcada, e os 10 horários continuam lá para
-- serem resolvidos com calma.
--
-- O bloqueio continua servindo para o caso pequeno: almoço, duas horas, ou um
-- dia que já está vazio.
--
-- ## Por que o filtro entra na `jornada`, e não no fim da consulta
--
-- `na_grade` (a grade de 10 em 10) e `apos_atendimento` (o encaixe logo depois
-- de um atendimento) **as duas nascem da `jornada`**. Tirando o barbeiro de lá,
-- ele desaparece das duas de uma vez, e não sobra caminho por onde uma vaga
-- escape. Um `not exists` no fim seria avaliado por candidato e deixaria a
-- pergunta "cobri as duas origens?" aberta.
--
-- `horarios_livres` é a régua única: CRM, agenda pública (a grade do dia E a
-- faixa de catorze, via `dias_com_horario`), `agendar_pelo_agente`,
-- `remarcar_pelo_cliente`, `quem_pode_assumir`,
-- `criar_agendamentos_de_reativacao` e `chamar_proximos_da_fila` todos passam
-- por ela — os três primeiros como trava de recusa, não como sugestão. Uma
-- linha aqui fecha as seis portas.
--
-- ## O nome
--
-- `dias_de_folga`, e não `folgas`: neste projeto "folga" já significa outra
-- coisa — `salons.folga_entre_atendimentos_minutos`, a respiração entre dois
-- atendimentos, que aparece como `cfg.folga` dentro desta mesma função. Duas
-- folgas no mesmo corpo de consulta seria pedir para alguém confundir.

create table public.dias_de_folga (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  dia date not null,
  motivo text,
  criada_em timestamptz not null default now(),
  -- Um barbeiro, um dia, uma folga. Sem isto, dois cliques no botão viram duas
  -- linhas e a remoção da folga tiraria só uma — o dia continuaria fechado sem
  -- nada na tela explicando por quê.
  constraint dias_de_folga_um_por_dia unique (professional_id, dia),
  -- O mesmo teto do motivo do bloqueio (`appointments_motivo_do_bloqueio_tamanho`),
  -- para a tela poder reusar o contador de caracteres que já existe.
  constraint dias_de_folga_motivo_tamanho check (motivo is null or length(motivo) <= 60)
);

-- A pergunta que a régua faz é sempre "este barbeiro está de folga NESTE dia?",
-- uma vez por dia consultado — e `dias_com_horario` a faz 14 vezes seguidas.
create index dias_de_folga_por_dia on public.dias_de_folga (dia, professional_id);

alter table public.dias_de_folga enable row level security;

-- As duas políticas são as de `professional_schedules`, de propósito: a folga é
-- o mesmo tipo de dado (a disponibilidade do barbeiro) com a mesma plateia — o
-- gestor gerencia, e o barbeiro lê a própria.
create policy "dias_de_folga: gestor gerencia" on public.dias_de_folga
  for all
  using (exists (select 1 from public.professionals p
                  where p.id = dias_de_folga.professional_id
                    and private.is_manager(p.salon_id)))
  with check (exists (select 1 from public.professionals p
                       where p.id = dias_de_folga.professional_id
                         and private.is_manager(p.salon_id)));

create policy "dias_de_folga: leitura conforme papel" on public.dias_de_folga
  for select
  using (
    professional_id in (
      select pr.id from public.professionals pr
       where pr.salon_id in (select private.salon_ids())
    )
    and (
      professional_id in (select private.my_professional_ids())
      or exists (select 1 from public.professionals p
                  where p.id = dias_de_folga.professional_id
                    and private.is_manager(p.salon_id))
    )
  );

-- O trinco, reposto à mão como sempre: tabela nova no schema `public` nasce com
-- grant para `anon` pelo padrão do schema. A agenda pública lê pelo service
-- role (a edge usa `admin`), então `anon` não precisa de nada aqui — e cliente
-- nenhum tem motivo para saber quando o barbeiro tira folga.
revoke all on public.dias_de_folga from anon;

-- `revoke all` antes do `grant`, e não só o `grant`: o padrão do schema dá
-- **sete** privilégios a `authenticated`, não quatro. Os três que sobram
-- (`REFERENCES`, `TRIGGER`, `TRUNCATE`) não servem a tela nenhuma, e `TRUNCATE`
-- **ignora RLS** — com ele, um JWT de qualquer salão apagaria a folga de todos.
--
-- Medido ao conferir esta migration: `authenticated` tem TRUNCATE em 75
-- relações deste banco, `appointments` e `clients` entre elas. Não é alcançável
-- pelo PostgREST (os verbos REST viram só DML, e `authenticated` não é papel de
-- login), então é privilégio desnecessário e não buraco aberto — mas a tabela
-- nova não precisa herdar isso. O caso das 75 está no backlog.
revoke all on public.dias_de_folga from authenticated;
grant select, insert, update, delete on public.dias_de_folga to authenticated;

-- ---------------------------------------------------------------------------
-- A régua passa a descontar a folga.
--
-- `create or replace` de propósito (e não drop + create): preserva os grants e
-- os revokes da função, que nesta casa já custaram caro quando se recriou uma
-- view por inteiro.
-- ---------------------------------------------------------------------------
create or replace function public.horarios_livres(
  p_salon_id uuid,
  p_data date,
  p_duracao_minutos integer,
  p_professional_id uuid default null,
  p_ignorar_agendamento uuid default null
) returns table(
  professional_id uuid,
  profissional text,
  inicio timestamp with time zone,
  hora_local text
)
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
