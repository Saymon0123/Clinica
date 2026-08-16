-- Horários livres de hoje, por barbeiro.
--
-- É o motor da agenda pública: o cliente que chega sem hora marcada escaneia o
-- QR do balcão, vê o que está livre e marca sozinho — sem o barbeiro parar de
-- cortar para atendê-lo.
--
-- Mora no banco, e não na tela nem na edge function, por três razões:
--
-- 1. É determinístico. Jornada, duração do serviço e agendamentos existentes
--    são dados; o resultado é conta.
-- 2. Vai ser consultado por três lugares diferentes — a página pública, o CRM
--    e o agente do WhatsApp. Três implementações divergiriam, e a divergência
--    apareceria como horário oferecido que não existe.
-- 3. É a mesma regra que o agente já precisa respeitar hoje. Ter uma fonte só
--    é o que impede a página pública de oferecer o que o agente recusaria.

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

  -- Jornada de quem trabalha nesse dia da semana.
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

  -- Candidatos de 15 em 15 minutos. Granularidade fina o bastante para
  -- aproveitar buraco entre atendimentos, e grossa o bastante para a lista não
  -- virar um paredão de opções.
  candidatos as (
    -- A série é gerada sobre TIMESTAMP, não sobre `time`: o Postgres não tem
    -- `generate_series` para tipo hora, e descobrir isso aplicando custou uma
    -- tentativa.
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
   where
     -- Passado não é opção. A folga de 10 minutos evita oferecer um horário
     -- que já não dá tempo de começar.
     c.inicio > now() + interval '10 minutes'

     -- O atendimento inteiro precisa caber dentro do turno.
     and (c.fim at time zone f.tz)::time <= c.hora_fim

     -- Barbearia fechada nesse dia, ou fora do horário de funcionamento.
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

     -- Sem colidir com o que já existe. Mesma regra da trava de sobreposição
     -- do banco: `bloqueio` conta como ocupado, `cancelado` não.
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = c.professional_id
          and a.status <> 'cancelado'
          and tstzrange(a.data_hora_inicio, a.data_hora_fim) && tstzrange(c.inicio, c.fim)
     )
   order by c.inicio, c.nome;
$$;

comment on function public.horarios_livres(uuid, date, integer, uuid) is
  'Horarios livres por barbeiro num dia, respeitando jornada, horario da barbearia, duracao do servico e agendamentos existentes. Fonte unica para a pagina publica, o CRM e o agente.';

-- `security definer` porque a página pública roda sem usuário: quem consulta
-- não tem permissão de ler `appointments` nem `professional_schedules`, e não
-- deve mesmo. A função devolve **só horários**, nunca de quem é o agendamento
-- que ocupa o resto — é o mínimo que responde a pergunta.
revoke execute on function public.horarios_livres(uuid, date, integer, uuid) from public;
grant execute on function public.horarios_livres(uuid, date, integer, uuid) to service_role, authenticated;

-- A chave que controla o lançamento.
insert into public.recursos (chave, nome, descricao, padrao)
values (
  'agenda_publica',
  'Agenda pública (QR do balcão)',
  'Cliente que chega sem hora marcada escaneia o QR, ve os horarios livres e agenda sozinho.',
  false
)
on conflict (chave) do nothing;
