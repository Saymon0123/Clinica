-- 0113: reativação por agendamento automático
-- O barbeiro pergunta no caixa de quantas em quantas semanas o cliente corta.
-- O sistema cria o horário de verdade (origem 'reativacao') e manda o template
-- de confirmação 1 dia antes; sem resposta até 3h antes, cancela e libera a vaga.
-- Sim = cobrável; Remarcar = cai no agente (cobra lá); Cancelar = sai da base.

-- 1) Cliente: intervalo (opt-in), pausa e contadores de silêncio/no-show
alter table public.clients
  add column if not exists reativacao_semanas smallint
    check (reativacao_semanas between 1 and 8),
  add column if not exists reativacao_pausada_em timestamptz,
  add column if not exists reativacao_sem_resposta smallint not null default 0,
  add column if not exists reativacao_no_shows smallint not null default 0;

-- 2) Agendamento: origem nova + carimbo do "Sim" (é o marcador de cobrança)
alter table public.appointments drop constraint appointments_origem_check;
alter table public.appointments
  add constraint appointments_origem_check
  check (origem = any (array['crm'::text, 'agente'::text, 'publico'::text, 'reativacao'::text]));
alter table public.appointments
  add column if not exists reativacao_confirmada_em timestamptz;

-- 3) Log de envios (tabela legada vazia, reaproveitada; a fatura já conta ela)
alter table public.reativacao_envios
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists template text;
create index if not exists idx_reativacao_envios_appointment
  on public.reativacao_envios (appointment_id);

-- 4) Criação dos horários provisórios: roda de hora em hora e cria os que
--    começam daqui a 24–25h (assim o envio sai ~1 dia antes, no mesmo horário).
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
begin
  for v_c in
    select c.id as client_id, c.salon_id, c.reativacao_semanas,
           a.professional_id, a.service_id, a.data_hora_inicio,
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
    -- menor múltiplo do intervalo que ainda está no futuro
    v_k := greatest(1, ceil(extract(epoch from (now() - v_c.data_hora_inicio))
                            / extract(epoch from (v_c.reativacao_semanas * interval '7 days')))::integer);
    v_alvo := v_c.data_hora_inicio + v_k * (v_c.reativacao_semanas * interval '7 days');

    -- só cria o que começa na janela de 24–25h a partir de agora
    continue when v_alvo < now() + interval '24 hours' or v_alvo >= now() + interval '25 hours';

    -- cliente que já tem horário futuro não precisa de reativação
    continue when exists (
      select 1 from public.appointments a
       where a.client_id = v_c.client_id
         and a.status in ('agendado', 'confirmado')
         and a.data_hora_inicio > now()
    );

    -- vaga ocupada no barbeiro → pula esta rodada
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
       v_alvo, v_alvo + v_c.duracao, 'agendado', 'reativacao');
    v_criados := v_criados + 1;
  end loop;
  return v_criados;
end;
$$;
revoke all on function public.criar_agendamentos_de_reativacao() from public, anon, authenticated;

-- 5) Fila de envio para o n8n (barbeiro/serviço/cliente resolvidos)
drop view if exists public.reativacoes_a_enviar;
create view public.reativacoes_a_enviar
with (security_invoker = on) as
select a.id as appointment_id,
       a.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       c.telefone_norm,
       c.reativacao_sem_resposta,
       p.nome as barbeiro,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM') as data,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.salons s on s.id = a.salon_id
  left join public.professionals p on p.id = a.professional_id
 where a.origem = 'reativacao'
   and a.status = 'agendado'
   and not a.confirmacao_enviada
   and a.data_hora_inicio between now() + interval '2 hours' and now() + interval '26 hours'
   and not c.recusou_contato
   and c.reativacao_pausada_em is null;

-- 6) O n8n marca o envio: guarda o wamid (reusa a mecânica do lembrete),
--    loga em reativacao_envios e conta o silêncio do cliente
create or replace function public.marcar_reativacao_enviada(
  p_appointment_id uuid, p_message_id text, p_template text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ag public.appointments%rowtype;
begin
  select * into v_ag from public.appointments
   where id = p_appointment_id and origem = 'reativacao';
  if not found then return; end if;
  update public.appointments
     set confirmacao_enviada = true, lembrete_message_id = p_message_id
   where id = v_ag.id;
  insert into public.reativacao_envios (salon_id, client_id, appointment_id, template, etapa)
  values (v_ag.salon_id, v_ag.client_id, v_ag.id, p_template, 1);
  update public.clients
     set reativacao_sem_resposta = reativacao_sem_resposta + 1
   where id = v_ag.client_id;
end;
$$;
revoke all on function public.marcar_reativacao_enviada(uuid, text, text) from public, anon, authenticated;

-- 7) Expiração: sem resposta até 3h antes → cancela e libera a vaga;
--    2 envios seguidos sem clique → pausa a base do cliente
create or replace function public.expira_reativacoes_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_total integer;
begin
  with expiradas as (
    update public.appointments a
       set status = 'cancelado'
     where a.origem = 'reativacao'
       and a.status = 'agendado'
       and a.confirmacao_enviada
       and a.lembrete_respondido_em is null
       and a.data_hora_inicio < now() + interval '3 hours'
    returning a.client_id
  )
  select count(*) into v_total from expiradas;

  update public.clients c
     set reativacao_pausada_em = now()
   where c.reativacao_pausada_em is null
     and c.reativacao_sem_resposta >= 2;
  return v_total;
end;
$$;
revoke all on function public.expira_reativacoes_sem_resposta() from public, anon, authenticated;

-- 8) Botões: comportamento extra quando o agendamento é de reativação
create or replace function public.responder_lembrete(p_message_id text, p_botao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ag public.appointments%rowtype; v_acao text; v_cliente text; v_hora text; v_botao text;
  v_reativacao boolean;
begin
  if p_message_id is null or p_botao is null then return jsonb_build_object('atendido', false); end if;
  select * into v_ag from public.appointments where lembrete_message_id = p_message_id;
  if not found then return jsonb_build_object('atendido', false); end if;
  if v_ag.lembrete_respondido_em is not null then
    return jsonb_build_object('atendido', true, 'acao', 'repetido', 'salon_id', v_ag.salon_id, 'resposta', null);
  end if;
  v_botao := lower(translate(p_botao, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'));
  if v_botao like 'sim%' then v_acao := 'confirmado';
  elsif v_botao like '%reagend%' or v_botao like '%remarc%' then v_acao := 'reagendar';
  elsif v_botao like '%cancel%' then v_acao := 'cancelado';
  else return jsonb_build_object('atendido', false); end if;
  if v_ag.data_hora_inicio <= now() then
    return jsonb_build_object('atendido', false, 'acao', 'tarde_demais', 'salon_id', v_ag.salon_id);
  end if;
  if v_ag.status not in ('agendado', 'confirmado') then
    return jsonb_build_object('atendido', false, 'acao', 'status_incompativel');
  end if;
  v_reativacao := (v_ag.origem = 'reativacao');
  select coalesce(split_part(c.nome, ' ', 1), '') into v_cliente from public.clients c where c.id = v_ag.client_id;
  v_hora := to_char(v_ag.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
  if v_acao = 'confirmado' then
    update public.appointments
       set status = 'confirmado', lembrete_respondido_em = now(),
           reativacao_confirmada_em = case when v_reativacao then now() else reativacao_confirmada_em end
     where id = v_ag.id;
    if v_reativacao then
      update public.clients set reativacao_sem_resposta = 0 where id = v_ag.client_id;
    end if;
    return jsonb_build_object('atendido', true, 'acao', 'confirmado', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id,
      'resposta', 'Show, ' || v_cliente || '! Confirmado para as ' || v_hora || '. Até logo!');
  elsif v_acao = 'cancelado' then
    update public.appointments set status = 'cancelado', lembrete_respondido_em = now() where id = v_ag.id;
    if v_reativacao then
      -- pediu para parar: sai da base de reativação de vez
      update public.clients
         set reativacao_pausada_em = now(), reativacao_sem_resposta = 0
       where id = v_ag.client_id;
      return jsonb_build_object('atendido', true, 'acao', 'cancelado', 'salon_id', v_ag.salon_id,
        'appointment_id', v_ag.id,
        'resposta', 'Tudo bem, ' || v_cliente || '! Cancelei e não vou mais reservar horário automático para você. Quando quiser marcar, é só chamar aqui.');
    end if;
    return jsonb_build_object('atendido', true, 'acao', 'cancelado', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id,
      'resposta', 'Ok, ' || v_cliente || ', cancelei seu horário das ' || v_hora
                  || '. Quando quiser marcar de novo, é só chamar.');
  else
    if v_reativacao then
      -- libera a vaga provisória; o agente marca o novo horário na conversa
      update public.appointments
         set status = 'cancelado', reagendamento_pedido_em = now(), lembrete_respondido_em = now()
       where id = v_ag.id;
      update public.clients set reativacao_sem_resposta = 0 where id = v_ag.client_id;
    else
      update public.appointments set reagendamento_pedido_em = now(), lembrete_respondido_em = now() where id = v_ag.id;
    end if;
    return jsonb_build_object('atendido', true, 'acao', 'reagendar', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id, 'entregar_ao_agente', true, 'resposta', null);
  end if;
end; $$;

-- 9) No-show e conclusão realimentam a base
create or replace function public.trg_reativacao_pos_atendimento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.origem <> 'reativacao' or new.status = old.status then return new; end if;
  if new.status = 'faltou' then
    update public.clients
       set reativacao_no_shows = reativacao_no_shows + 1,
           reativacao_pausada_em = case when reativacao_no_shows + 1 >= 2 then now() else reativacao_pausada_em end
     where id = new.client_id;
  elsif new.status = 'concluido' then
    update public.clients set reativacao_no_shows = 0 where id = new.client_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reativacao_pos_atendimento on public.appointments;
create trigger trg_reativacao_pos_atendimento
  after update of status on public.appointments
  for each row execute function public.trg_reativacao_pos_atendimento();

-- 10) Cobrança: o "Sim" da reativação vira agendamento cobrável na fatura
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
         coalesce(sum(s.preco), 0),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'data', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
               'servico', coalesce(s.nome, '—'),
               'valor_servico', coalesce(s.preco, 0),
               'status', a.status
             )
             order by a.created_at
           ),
           '[]'::jsonb
         )
    into v_agendamentos, v_valor_gerado, v_detalhe
    from public.appointments a
    left join public.services s on s.id = a.service_id
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

-- 11) Resumo para o dashboard do agente (mês corrente, RLS do barbeiro)
drop view if exists public.reativacao_resumo;
create view public.reativacao_resumo
with (security_invoker = on) as
select a.salon_id,
       count(*) filter (where a.confirmacao_enviada) as enviados,
       count(*) filter (where a.reativacao_confirmada_em is not null) as confirmados,
       count(*) filter (where a.reagendamento_pedido_em is not null) as remarcados,
       count(*) filter (where a.status = 'cancelado' and a.reativacao_confirmada_em is null
                          and a.reagendamento_pedido_em is null) as cancelados,
       coalesce(sum(s.preco) filter (where a.status = 'concluido'), 0) as receita_concluida
  from public.appointments a
  left join public.services s on s.id = a.service_id
 where a.origem = 'reativacao'
   and a.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
 group by a.salon_id;

-- 12) Relógios
select cron.schedule('cria-reativacoes', '10 * * * *',
  $$select public.criar_agendamentos_de_reativacao()$$);
select cron.schedule('expira-reativacoes', '*/15 * * * *',
  $$select public.expira_reativacoes_sem_resposta()$$);
