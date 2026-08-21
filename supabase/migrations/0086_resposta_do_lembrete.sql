-- O lembrete vira uma pergunta com tres botoes, e a resposta e aplicada pelo
-- banco -- nao pelo agente.
--
-- **Por que o agente fica de fora.** Um clique em "Sim, confirmo" nao e uma
-- conversa: e um comando, com tres valores possiveis e um significado exato em
-- cada um. Passar isso por um modelo de linguagem troca uma decisao certa por
-- uma provavel, e cria a chance de ele responder algo criativo a um cliente que
-- so queria confirmar presenca. Tambem custa uma chamada de LLM por clique,
-- todo dia, em todo agendamento.
--
-- **A chave e o `wamid`, nao o texto.** Quem responde botao de template chega
-- com `context.id` = o id da mensagem que estamos respondendo. Guardamos esse
-- id no agendamento quando o lembrete sai, e o clique so e tratado se casar com
-- ele. Isso e o que impede que um cliente que simplesmente digitou "cancelar"
-- no meio de uma conversa tenha o horario cancelado sem falar com ninguem.

alter table public.appointments
  add column if not exists lembrete_message_id text,
  add column if not exists lembrete_respondido_em timestamptz,
  add column if not exists reagendamento_pedido_em timestamptz;

create unique index if not exists appointments_lembrete_message_id_idx
  on public.appointments (lembrete_message_id)
  where lembrete_message_id is not null;

comment on column public.appointments.lembrete_message_id is
  'wamid da mensagem de lembrete enviada pela Cloud API. E a CHAVE da resposta: o clique do cliente so e aplicado quando o context.id dele casa com este valor. Sem isso, qualquer mensagem com a palavra "cancelar" viraria um cancelamento.';
comment on column public.appointments.lembrete_respondido_em is
  'Quando o cliente clicou em um dos botoes do lembrete. Serve tambem de trava de idempotencia: a Meta reentrega webhooks, e sem isso o mesmo clique seria aplicado duas vezes.';
comment on column public.appointments.reagendamento_pedido_em is
  'Cliente pediu para reagendar pelo botao do lembrete. O horario NAO e liberado aqui -- so quando o novo for escolhido, senao a cadeira fica vaga por uma intencao que pode nao se concretizar.';

-- Aplica o botao do lembrete.
--
-- Devolve sempre um jsonb dizendo o que aconteceu, porque quem chama e o
-- webhook rodando com service_role e precisa decidir duas coisas: qual texto
-- responder e se a conversa deve ou nao seguir para o agente.
--
-- `atendido = false` significa "isto nao era resposta de lembrete" -- e ai o
-- webhook segue o caminho normal, o agente recebe, nada se perde.
create or replace function public.responder_lembrete(
  p_message_id text,
  p_botao text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ag public.appointments%rowtype;
  v_acao text;
  v_cliente text;
  v_hora text;
  v_botao text;
begin
  if p_message_id is null or p_botao is null then
    return jsonb_build_object('atendido', false);
  end if;

  select * into v_ag
    from public.appointments
   where lembrete_message_id = p_message_id;

  if not found then
    -- Nao e resposta de lembrete: pode ser botao de outro template, ou uma
    -- mensagem qualquer. Quem chama entrega ao agente.
    return jsonb_build_object('atendido', false);
  end if;

  -- Reentrega da Meta, ou cliente clicando duas vezes. Consumimos o evento
  -- (para o agente nao ver) mas nao respondemos de novo.
  if v_ag.lembrete_respondido_em is not null then
    return jsonb_build_object(
      'atendido', true, 'acao', 'repetido',
      'salon_id', v_ag.salon_id, 'resposta', null
    );
  end if;

  -- Acentuacao vem do jeito que a Meta mandar; comparar sem ela evita depender
  -- de como o texto do botao foi cadastrado no painel.
  v_botao := lower(translate(p_botao, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'));

  if v_botao like 'sim%' then
    v_acao := 'confirmado';
  elsif v_botao like '%reagend%' or v_botao like '%remarc%' then
    v_acao := 'reagendar';
  elsif v_botao like '%cancel%' then
    v_acao := 'cancelado';
  else
    -- Botao desconhecido e texto livre nao sao a mesma coisa que silencio:
    -- melhor o agente ler do que o sistema adivinhar.
    return jsonb_build_object('atendido', false);
  end if;

  -- Clique que chegou depois da hora. Nao mexemos no agendamento -- o horario
  -- ja passou, e cancelar retroativamente falsearia o historico e o caixa.
  if v_ag.data_hora_inicio <= now() then
    return jsonb_build_object(
      'atendido', false, 'acao', 'tarde_demais', 'salon_id', v_ag.salon_id
    );
  end if;

  if v_ag.status not in ('agendado', 'confirmado') then
    return jsonb_build_object('atendido', false, 'acao', 'status_incompativel');
  end if;

  select coalesce(split_part(c.nome, ' ', 1), '') into v_cliente
    from public.clients c where c.id = v_ag.client_id;

  v_hora := to_char(v_ag.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI');

  if v_acao = 'confirmado' then
    update public.appointments
       set status = 'confirmado', lembrete_respondido_em = now()
     where id = v_ag.id;

    return jsonb_build_object(
      'atendido', true, 'acao', 'confirmado', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id,
      'resposta', 'Show, ' || v_cliente || '! Confirmado para as ' || v_hora || '. Até logo!'
    );

  elsif v_acao = 'cancelado' then
    update public.appointments
       set status = 'cancelado', lembrete_respondido_em = now()
     where id = v_ag.id;

    return jsonb_build_object(
      'atendido', true, 'acao', 'cancelado', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id,
      'resposta', 'Ok, ' || v_cliente || ', cancelei seu horário das ' || v_hora
                  || '. Quando quiser marcar de novo, é só chamar.'
    );

  else
    -- Reagendar e a unica das tres que nao termina em si mesma: escolher outro
    -- horario e conversa, e o agente ja sabe fazer isso com todas as travas.
    -- O clique em si continua sendo tratado aqui -- o que vai para o agente e
    -- a conversa que vem depois, nao o botao.
    --
    -- O horario antigo NAO e liberado agora: se fosse, o cliente perderia a
    -- vaga so por ter cogitado trocar, e poderia acabar sem horario nenhum.
    update public.appointments
       set reagendamento_pedido_em = now(), lembrete_respondido_em = now()
     where id = v_ag.id;

    return jsonb_build_object(
      'atendido', true, 'acao', 'reagendar', 'salon_id', v_ag.salon_id,
      'appointment_id', v_ag.id,
      'entregar_ao_agente', true,
      'resposta', null
    );
  end if;
end;
$$;

revoke execute on function public.responder_lembrete(text, text) from anon, authenticated;

comment on function public.responder_lembrete(text, text) is
  'Aplica o botao do lembrete (Sim / Reagendar / Cancelar) e devolve o que fazer em seguida. Casa pelo wamid, nunca pelo texto solto. Devolve atendido=false quando a mensagem nao e resposta de lembrete -- e ai quem chama deve entregar ao agente.';
