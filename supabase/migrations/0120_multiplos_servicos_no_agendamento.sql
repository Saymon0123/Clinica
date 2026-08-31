-- 0120: corte + barba num agendamento só (item 6 da realidade do balcão)
--
-- O agendamento ganha uma tabela filha com TODOS os serviços; a coluna
-- `service_id` continua existindo como o serviço PRINCIPAL (o primeiro),
-- para nada que lê um serviço só quebrar. A duração vira a soma — inclusive
-- ao ARRASTAR o horário na agenda (o recálculo do trigger passava a encolher
-- o agendamento para a duração do principal).
--
-- Cobrança: multi-serviço continua sendo 1 agendamento cobrável (decisão de
-- 30/08 — cobra-se o horário conquistado, não a quantidade de serviço); o
-- valor_gerado da fatura passa a somar todos os serviços.
--
-- Fase 2 (fora daqui): agente e QR público seguem marcando UM serviço — mexer
-- na duração que a IA calcula é risco de overbooking e vai com teste real.

-- 1) A tabela filha
create table if not exists public.appointment_services (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id),
  ordem smallint not null default 1,
  primary key (appointment_id, service_id)
);
alter table public.appointment_services enable row level security;
-- Leitura acompanha o agendamento; escrita só pela RPC (definer) e service_role.
create policy "appointment_services: leitura do proprio salao"
  on public.appointment_services for select
  using (exists (
    select 1 from public.appointments a
     where a.id = appointment_id
       and a.salon_id in (select private.salon_ids())
  ));
create index if not exists idx_appointment_services_service
  on public.appointment_services (service_id);

-- 2) Backfill: todo agendamento existente vira "um serviço na filha"
insert into public.appointment_services (appointment_id, service_id, ordem)
select a.id, a.service_id, 1
  from public.appointments a
 where a.service_id is not null
on conflict do nothing;

-- 3) Daqui em diante, todo INSERT com service_id ganha a linha principal na
--    filha sozinho — agente, QR e reativação continuam inserindo um serviço
--    e ficam consistentes sem saber que a tabela existe.
create or replace function public.trg_espelha_servico_principal()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.service_id is not null then
    insert into public.appointment_services (appointment_id, service_id, ordem)
    values (new.id, new.service_id, 1)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.trg_espelha_servico_principal() from public, anon, authenticated;
drop trigger if exists trg_espelha_servico_principal on public.appointments;
create trigger trg_espelha_servico_principal
  after insert on public.appointments
  for each row execute function public.trg_espelha_servico_principal();

-- 4) O trigger de fim passa a somar a filha (fallback: serviço principal).
--    É o que impede o multi-serviço de ENCOLHER ao ser arrastado na agenda.
create or replace function public.calcula_fim_do_agendamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  minutos int;
begin
  if tg_op = 'INSERT' and new.data_hora_fim is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.data_hora_inicio = old.data_hora_inicio then
      return new;
    end if;
    if new.data_hora_fim is distinct from old.data_hora_fim then
      return new;
    end if;
  end if;

  if new.service_id is null then
    if tg_op = 'UPDATE' then
      new.data_hora_fim := new.data_hora_inicio + (old.data_hora_fim - old.data_hora_inicio);
      return new;
    end if;
    raise exception 'Sem service_id nao da para calcular o fim do agendamento; informe data_hora_fim.'
      using errcode = '23502';
  end if;

  -- Soma de TODOS os serviços do agendamento; se a filha ainda não tem linhas
  -- (INSERT — o espelho roda depois), cai no serviço principal.
  select coalesce(
           (select sum(s.duracao_minutos)
              from public.appointment_services asv
              join public.services s on s.id = asv.service_id
             where asv.appointment_id = new.id),
           (select s.duracao_minutos from public.services s where s.id = new.service_id)
         )
    into minutos;

  if minutos is null then
    raise exception 'Servico % nao encontrado ou sem duracao.', new.service_id
      using errcode = '23503';
  end if;

  new.data_hora_fim := new.data_hora_inicio + make_interval(mins => minutos);
  return new;
end;
$$;

-- 5) A RPC que o CRM chama para definir a lista completa. Definer com checagem
--    explícita de vínculo (definer ignora RLS — a autorização mora aqui).
create or replace function public.definir_servicos_do_agendamento(
  p_appointment_id uuid, p_service_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ag public.appointments%rowtype;
  v_total int;
  v_minutos int;
begin
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Informe ao menos um servico.' using errcode = '22023';
  end if;

  select * into v_ag from public.appointments where id = p_appointment_id;
  if not found or v_ag.salon_id not in (select private.salon_ids()) then
    raise exception 'Agendamento nao encontrado.' using errcode = '42501';
  end if;
  if v_ag.status = 'bloqueio' then
    raise exception 'Bloqueio nao tem servico.' using errcode = '22023';
  end if;

  -- Todos os serviços precisam ser do mesmo salão e ativos
  select count(*) into v_total
    from unnest(p_service_ids) sid
    join public.services s on s.id = sid and s.salon_id = v_ag.salon_id;
  if v_total <> array_length(p_service_ids, 1) then
    raise exception 'Servico de outro salao ou inexistente.' using errcode = '22023';
  end if;

  delete from public.appointment_services where appointment_id = p_appointment_id;
  insert into public.appointment_services (appointment_id, service_id, ordem)
  select p_appointment_id, sid, ord
    from unnest(p_service_ids) with ordinality as u(sid, ord)
  on conflict do nothing;

  select sum(s.duracao_minutos) into v_minutos
    from public.appointment_services asv
    join public.services s on s.id = asv.service_id
   where asv.appointment_id = p_appointment_id;

  -- Fim explícito junto do início inalterado: o trigger deixa passar; a trava
  -- de sobreposição do banco decide se cabe (23P01 volta ao chamador).
  update public.appointments
     set service_id = p_service_ids[1],
         data_hora_fim = data_hora_inicio + make_interval(mins => v_minutos)
   where id = p_appointment_id;
end;
$$;
revoke all on function public.definir_servicos_do_agendamento(uuid, uuid[]) from public, anon;

-- 6) Leitura amigável para o CRM
drop view if exists public.servicos_do_agendamento;
create view public.servicos_do_agendamento
with (security_invoker = on) as
select asv.appointment_id,
       asv.ordem,
       s.id as service_id,
       s.nome,
       s.preco,
       s.duracao_minutos
  from public.appointment_services asv
  join public.services s on s.id = asv.service_id;

-- 7) Fatura: valor_gerado e detalhe somam todos os serviços do agendamento
create or replace function public.gerar_fatura_de_uso(p_salon_id uuid, p_inicio date, p_fim date, p_motivo text default 'mensal'::text)
returns faturas_de_uso
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_barbeiros integer;
  v_preco numeric;
  v_agendamentos integer;
  v_lembretes integer;
  v_reativacoes integer;
  v_valor_gerado numeric;
  v_detalhe jsonb;
  v_fatura public.faturas_de_uso;
begin
  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  if found then
    return v_fatura;
  end if;

  select count(*) into v_barbeiros
    from public.professionals p
   where p.salon_id = p_salon_id and p.ativo;

  v_preco := public.preco_por_uso(v_barbeiros);

  select count(*),
         coalesce(sum(sv.total), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(sv.nomes, '—'),
               'valor_servico', coalesce(sv.total, 0),
               'status', a.status
             )
             order by a.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.appointments a
    left join lateral (
      select sum(s.preco) as total,
             string_agg(s.nome, ' + ' order by asv.ordem) as nomes
        from public.appointment_services asv
        join public.services s on s.id = asv.service_id
       where asv.appointment_id = a.id
    ) sv on true
   where a.salon_id = p_salon_id
     and (a.origem = 'agente'
          or (a.origem = 'reativacao' and a.reativacao_confirmada_em is not null))
     and a.status <> 'bloqueio'
     and (a.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_lembretes
    from public.appointments a
   where a.salon_id = p_salon_id and a.lembrete_enviado
     and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  select count(*) into v_reativacoes
    from public.reativacao_envios r
   where r.salon_id = p_salon_id
     and (r.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;

  insert into public.faturas_de_uso (
    salon_id, periodo_inicio, periodo_fim, motivo, barbeiros, preco_unitario,
    agendamentos, lembretes, reativacoes, valor, valor_gerado, detalhe
  ) values (
    p_salon_id, p_inicio, p_fim, p_motivo, v_barbeiros, coalesce(v_preco, 0.75),
    v_agendamentos, v_lembretes, v_reativacoes,
    round(coalesce(v_preco, 0.75) * v_agendamentos, 2), v_valor_gerado, v_detalhe
  )
  on conflict (salon_id, periodo_inicio, periodo_fim, motivo) do nothing;

  select * into v_fatura
    from public.faturas_de_uso
   where salon_id = p_salon_id and periodo_inicio = p_inicio
     and periodo_fim = p_fim and motivo = p_motivo;
  return v_fatura;
end;
$$;

-- 8) Reativação: o próximo horário copia TODOS os serviços do último corte
--    (a duração já vinha certa — fim-início do concluído — mas a filha e o
--    principal precisam vir juntos para a comanda pré-preencher completa).
create or replace function public.criar_agendamentos_de_reativacao()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_c record;
  v_alvo timestamptz;
  v_k integer;
  v_criados integer := 0;
  v_novo uuid;
begin
  for v_c in
    select c.id as client_id, c.salon_id, c.reativacao_semanas,
           a.id as ultimo_id, a.professional_id, a.service_id, a.data_hora_inicio,
           (a.data_hora_fim - a.data_hora_inicio) as duracao
      from public.clients c
      join lateral (
        select a.* from public.appointments a
         where a.client_id = c.id and a.status = 'concluido'
           and a.service_id is not null
         order by a.data_hora_inicio desc
         limit 1
      ) a on true
     where c.reativacao_semanas is not null
       and c.reativacao_pausada_em is null
       and not c.recusou_contato
       and c.telefone_norm is not null
  loop
    v_k := greatest(1, ceil(extract(epoch from (now() - v_c.data_hora_inicio))
                            / extract(epoch from (v_c.reativacao_semanas * interval '7 days')))::integer);
    v_alvo := v_c.data_hora_inicio + v_k * (v_c.reativacao_semanas * interval '7 days');

    continue when v_alvo < now() + interval '24 hours' or v_alvo >= now() + interval '25 hours';

    continue when exists (
      select 1 from public.appointments a
       where a.client_id = v_c.client_id
         and a.status in ('agendado', 'confirmado')
         and a.data_hora_inicio > now()
    );

    continue when exists (
      select 1 from public.appointments a
       where a.professional_id = v_c.professional_id
         and a.status in ('agendado', 'confirmado', 'bloqueio')
         and a.data_hora_inicio < v_alvo + v_c.duracao
         and a.data_hora_fim > v_alvo
    );

    insert into public.appointments
      (salon_id, client_id, professional_id, service_id,
       data_hora_inicio, data_hora_fim, status, origem)
    values
      (v_c.salon_id, v_c.client_id, v_c.professional_id, v_c.service_id,
       v_alvo, v_alvo + v_c.duracao, 'agendado', 'reativacao')
    returning id into v_novo;

    -- Copia a lista completa do último corte (o espelho já pôs o principal;
    -- aqui entram os demais, na mesma ordem).
    insert into public.appointment_services (appointment_id, service_id, ordem)
    select v_novo, asv.service_id, asv.ordem
      from public.appointment_services asv
     where asv.appointment_id = v_c.ultimo_id
    on conflict do nothing;

    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;
revoke all on function public.criar_agendamentos_de_reativacao() from public, anon, authenticated;
