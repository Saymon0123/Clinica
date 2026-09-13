-- 0166: uma regra para cancelar, em vez de três.
--
-- TRÊS PORTAS, TRÊS REGRAS. O cliente cancela o próprio horário por três
-- caminhos, e até hoje cada um decidia sozinho quando era tarde demais:
--
--   link público (agenda-publica)      30 minutos
--   botão do lembrete (esta função)    só `> agora` -- cancela faltando 1 min
--   agente no WhatsApp                 nenhuma regra
--
-- O comentário da `agenda-publica` já dizia, em 10/09: "mesma ação, duas
-- portas, duas regras". O conserto daquele dia cobriu uma porta; as outras duas
-- continuaram. E a ironia é que a mais frouxa é a mais usada: o lembrete chega
-- 85 a 100 minutos antes, com o botão de cancelar dentro dele.
--
-- O QUE A REGRA QUER, e isto decide o desenho: ela não existe para impedir o
-- cancelamento. O comentário da edge é explícito -- "quem cancela dentro dos 30
-- min ia faltar de qualquer jeito; a diferença é o barbeiro ficar sabendo".
-- Ela existe para a cadeira não esvaziar em silêncio.
--
-- Por isso, dentro dos 30 minutos, esta função NÃO cancela e RESPONDE, mandando
-- a pessoa falar com a barbearia. O horário continua de pé na agenda, e o
-- barbeiro fica sabendo pela conversa -- que é o ponto.
--
-- VALE SÓ PARA CANCELAR (decisão do dono, 13/09). Confirmar presença em cima da
-- hora é inofensivo e segue livre. "Reagendar" também, porque ele já não
-- cancela nada sozinho: só marca o pedido e entrega a conversa ao agente.

create or replace function private.pode_cancelar(p_inicio timestamptz)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select p_inicio - now() >= interval '30 minutes';
$function$;

comment on function private.pode_cancelar(timestamptz) is
  'A regra dos 30 minutos, num lugar so. Serve as portas pelas quais o CLIENTE cancela: o link publico, o botao do lembrete e o agente. O CRM da barbearia fica de fora de proposito -- o barbeiro cancela a hora que quiser.';

-- ---------------------------------------------------------------------------
-- O botão do lembrete passa a respeitar a regra
-- ---------------------------------------------------------------------------
-- Reproduzida por inteiro porque é plpgsql; a única mudança é o bloco marcado
-- com "0166", dentro do ramo de cancelamento.
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
    -- 0166: o piso de 30 minutos, o mesmo do link público.
    --
    -- `lembrete_respondido_em` fica NULO de propósito: a pessoa não resolveu
    -- nada ainda. Marcar aqui faria o próximo toque no botão cair no ramo
    -- 'repetido', e ela ficaria sem resposta nenhuma -- pior que a recusa. Como
    -- não cancelou, tocar de novo depois (já fora da janela, ou depois de falar
    -- com a barbearia) tem de continuar valendo.
    if not private.pode_cancelar(v_ag.data_hora_inicio) then
      return jsonb_build_object('atendido', true, 'acao', 'cancelar_tarde', 'salon_id', v_ag.salon_id,
        'appointment_id', v_ag.id,
        'resposta', 'Falta menos de 30 minutos para o seu horário das ' || v_hora || ', ' || v_cliente
                    || '. Para cancelar agora, fale direto com a barbearia — assim dá tempo de encaixar outra pessoa.');
    end if;
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

comment on function public.responder_lembrete(text, text) is
  'Trata o toque nos botoes do lembrete. Desde a 0166, CANCELAR respeita o piso de 30 minutos de private.pode_cancelar -- o mesmo do link publico. Dentro da janela nao cancela e responde mandando falar com a barbearia, e NAO marca lembrete_respondido_em, para o botao continuar valendo. Confirmar e reagendar seguem sem piso.';
