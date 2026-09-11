-- 0154: a pausa da reativação diz por quê — e o "não quero mais" do cliente
-- deixa de ser desfeito por uma venda qualquer
--
-- Achado 1 do plano C (11/09), correção aprovada pelo dono no mesmo dia.
--
-- O defeito: o cliente toca "Cancelar" no convite da reativação e ouve "não vou
-- mais reservar horário automático para você" (`responder_lembrete`). Só a
-- pausa era gravada; `reativacao_semanas` continuava lá. Na visita seguinte a
-- "Nova venda" pré-preenchia o "corta a cada quantas semanas?" com esse valor,
-- e salvar a venda zerava a pausa: a reserva automática voltava sem ninguém
-- decidir. E nenhuma tela mostrava que o cliente estava pausado, nem por quê.
--
-- Agora:
--   1. "Cancelar" no convite apaga também `reativacao_semanas`. A frase que o
--      cliente recebeu vira verdade literal, e voltar exige alguém preencher de
--      novo, com ele na frente.
--   2. Toda pausa grava o motivo em `reativacao_pausa_motivo`:
--      'pediu_para_parar' (o botão), 'faltas' (2 faltas — trigger da 0153) ou
--      'sem_resposta' (2 convites sem resposta). A tela da venda usa isso para
--      explicar a pausa em vez de escondê-la. Pausa com motivo nulo é pausa
--      antiga, de antes desta migration.
--
-- O opt-out de LGPD (`recusou_contato`) é outra coisa e não muda: ele bloqueia
-- qualquer mensagem; a pausa bloqueia só a reserva automática.

alter table public.clients
  add column if not exists reativacao_pausa_motivo text;

alter table public.clients
  drop constraint if exists clients_reativacao_pausa_motivo_valido;
alter table public.clients
  add constraint clients_reativacao_pausa_motivo_valido
  check (reativacao_pausa_motivo in ('pediu_para_parar', 'faltas', 'sem_resposta'));

-- 1. O botão "Cancelar" do convite. Única mudança em relação à versão anterior:
--    o update do cliente no ramo da reativação (apaga as semanas, grava o motivo).
create or replace function public.responder_lembrete(p_message_id text, p_botao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      update public.clients
         set reativacao_pausada_em = now(), reativacao_sem_resposta = 0,
             reativacao_semanas = null, reativacao_pausa_motivo = 'pediu_para_parar'
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
end;
$function$;

-- 2. Faltas (0153) passam a gravar o motivo — só quando são ELAS que pausam —,
--    e a correção (faltou → concluido) apaga o motivo junto com a pausa que
--    aquela falta causou. Pausa que já existia não é tocada.
create or replace function public.trg_reativacao_pos_atendimento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.origem <> 'reativacao' or new.status = old.status then return new; end if;
  if new.status = 'faltou' then
    update public.clients
       set reativacao_no_shows = reativacao_no_shows + 1,
           reativacao_pausada_em = coalesce(
             reativacao_pausada_em,
             case when reativacao_no_shows + 1 >= 2 then now() end
           ),
           reativacao_pausa_motivo = case
             when reativacao_pausada_em is null and reativacao_no_shows + 1 >= 2 then 'faltas'
             else reativacao_pausa_motivo
           end
     where id = new.client_id;
  elsif new.status = 'concluido' then
    update public.clients
       set reativacao_no_shows = 0,
           reativacao_pausada_em = case
             when old.status = 'faltou' and reativacao_pausada_em = old.updated_at then null
             else reativacao_pausada_em
           end,
           reativacao_pausa_motivo = case
             when old.status = 'faltou' and reativacao_pausada_em = old.updated_at then null
             else reativacao_pausa_motivo
           end
     where id = new.client_id;
  end if;
  return new;
end;
$function$;

-- 3. Dois convites sem resposta: a expiração grava o motivo junto com a pausa.
create or replace function public.expira_reativacoes_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  ),
  pausados as (
    update public.clients c
       set reativacao_pausada_em = now(),
           reativacao_pausa_motivo = 'sem_resposta'
     where c.id in (select client_id from expiradas)
       and c.reativacao_pausada_em is null
       and c.reativacao_sem_resposta >= 2
    returning c.id
  )
  select count(*) into v_total from expiradas;
  return v_total;
end;
$function$;
