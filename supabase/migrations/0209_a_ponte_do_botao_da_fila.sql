-- A ponte do botão da fila: o clique que não morre.
--
-- Decisão do dono em 03/10: **manter o aviso saindo pelo número central** (Cloud
-- API oficial), e construir a ponte para que o botão caia como resposta
-- entendida, em vez de morrer.
--
-- O que ele morria, hoje: a edge `whatsapp-webhook` tenta `responder_lembrete`,
-- tenta `responder_avaliacao`, testa opt-out, e termina em
--
--     console.error('clique no numero central sem lembrete nem avaliacao: ...')
--
-- O cliente aperta "Sim", **nada volta**, e a vaga dele fica presa 30 minutos
-- antes de ser dada a outro. Pior do que nunca ter avisado.
--
-- ## Como o sistema sabe de QUAL barbearia, com 10 barbearias
--
-- Pelo **wamid**, não pelo telefone. É o mesmo mecanismo que a
-- `responder_lembrete` usa desde sempre:
--
--     select * into v_ag from public.appointments where lembrete_message_id = p_message_id;
--
-- Cada mensagem enviada tem um id próprio (o `wamid`). Ele é guardado no envio;
-- quando a pessoa aperta um botão, a Meta manda `context.id` = o wamid da
-- mensagem respondida. O id aponta para UMA linha, e o `salon_id` vem de carona.
--
-- Telefone não serviria: a mesma pessoa pode ser cliente de duas barbearias, com
-- dois agendamentos e dois avisos. Só o wamid desempata. Por isso a tabela
-- abaixo existe, no mesmo molde do `avaliacao_pedidos.message_id`.
--
-- ## Por que uma TABELA e não uma coluna em `fila_de_espera`
--
-- A mesma inscrição é chamada mais de uma vez (a `devolver_chamados_sem_resposta`
-- devolve quem não respondeu). Com uma coluna, o aviso novo sobrescreve o
-- anterior, e quem rolar a conversa para cima e apertar num aviso **antigo** cai
-- outra vez no `console.error` — o mesmo buraco, mais estreito. Com a tabela,
-- todo wamid já enviado continua resolvível, e a função decide pelo estado ATUAL
-- da inscrição.
--
-- ## A carência que impede o laço
--
-- `Esse nao serve` devolve a vaga e mantém a inscrição esperando. Só isso criaria
-- laço: a `chamar_proximos_da_fila` seleciona `status = 'esperando'` **sem
-- carência nenhuma** (conferido), então a varredura seguinte ofereceria o MESMO
-- horário, e cada oferta é um template pago.
--
-- A regra que entra: **nunca oferecer o mesmo início duas vezes à mesma
-- inscrição.** O `fila_avisos` já guarda o início oferecido, então a trava é um
-- `not exists` dentro da escolha da vaga. É a informação que o cliente deu —
-- *"esse não serve"* — virando regra, em vez de um relógio arbitrário.
--
-- A função é recriada por inteiro, com o corpo tirado do arquivo da 0205 (não de
-- memória): antes disso foi provado que o arquivo e a produção são a MESMA
-- função, comparando `prosrc` normalizado (comentário fora, espaço colapsado) —
-- `logica_identica = true`. De quebra, a recriação devolve os comentários ao
-- banco, que tinha a versão sem eles.

------------------------------------------------------------------------------
-- 1. Os avisos já enviados, por wamid
------------------------------------------------------------------------------
create table if not exists public.fila_avisos (
  message_id    text primary key,
  fila_id       uuid not null references public.fila_de_espera(id) on delete cascade,
  -- O inicio OFERECIDO. Fica aqui, e nao so no appointment, porque a recusa
  -- APAGA a reserva -- e e justamente depois de apagada que a trava precisa
  -- saber que aquele horario ja foi oferecido a esta pessoa.
  inicio        timestamptz not null,
  enviado_em    timestamptz not null default now(),
  respondido_em timestamptz,
  botao         text
);

create index if not exists fila_avisos_fila_inicio_idx
  on public.fila_avisos (fila_id, inicio);

alter table public.fila_avisos enable row level security;

-- Tabela nova NASCE com privilegio para anon e authenticated pelo padrao do
-- schema -- foi exatamente o susto da 0204. Aqui nao ha tela que leia isto:
-- quem escreve e le e o service_role, que ignora RLS.
revoke all on public.fila_avisos from anon, authenticated;

comment on table public.fila_avisos is
  'Um aviso de vaga da fila efetivamente ENVIADO, pela chave que a Meta devolve no clique: o wamid. Existe por dois motivos. (1) Identidade: com N barbearias saindo pelo mesmo numero central, o telefone nao desempata (a mesma pessoa pode ser cliente de duas) -- o wamid aponta para UMA inscricao e o salon_id vem de carona. Mesmo mecanismo da responder_lembrete/appointments.lembrete_message_id. (2) Trava do laco: guarda o inicio oferecido, e a chamar_proximos_da_fila nunca oferece o mesmo inicio duas vezes a mesma inscricao -- sem isso, "Esse nao serve" devolveria a vaga e a varredura seguinte a ofereceria de novo, um template pago por volta.';

------------------------------------------------------------------------------
-- 2. Guardar o wamid depois do envio
------------------------------------------------------------------------------
-- O wamid só existe DEPOIS do envio, então quem o grava é o fluxo, logo após
-- mandar -- mesmo desenho do `Guardar wamid do Lembrete`. O início sai da
-- reserva da própria inscrição, e não do parâmetro: assim o fluxo não tem como
-- gravar um horário que não é o que foi oferecido.
create or replace function public.registrar_aviso_da_fila(
  p_fila_id uuid,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
  v_inicio timestamptz;
begin
  if p_fila_id is null or p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'Faltou a inscricao ou o wamid.' using errcode = '22023';
  end if;

  select f.status, a.data_hora_inicio
    into v_status, v_inicio
    from public.fila_de_espera f
    left join public.appointments a on a.id = f.appointment_id
   where f.id = p_fila_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'motivo', 'Essa inscricao nao existe.');
  end if;
  if v_status <> 'chamado' or v_inicio is null then
    return jsonb_build_object('ok', false,
      'motivo', 'Essa inscricao nao tem vaga segurada para avisar.');
  end if;

  insert into public.fila_avisos (message_id, fila_id, inicio)
  values (p_message_id, p_fila_id, v_inicio)
  on conflict (message_id) do nothing;

  return jsonb_build_object('ok', true, 'inicio', v_inicio);
end;
$function$;

revoke all on function public.registrar_aviso_da_fila(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_aviso_da_fila(uuid, text) to service_role;

comment on function public.registrar_aviso_da_fila(uuid, text) is
  'O fluxo chama logo DEPOIS de enviar o aviso da vaga, para guardar o wamid -- mesmo desenho do "Guardar wamid do Lembrete". Sem esta linha, o clique do cliente nao tem como ser resolvido e morre no console.error da edge. O `inicio` sai da reserva da propria inscricao, nunca de parametro: o fluxo nao pode gravar horario diferente do que foi oferecido.';

------------------------------------------------------------------------------
-- 3. A ponte: o botão vira ação
------------------------------------------------------------------------------
-- O formato de retorno é o da `responder_lembrete`, de propósito: a edge
-- encadeia as três do mesmo jeito (`atendido` false = não é minha, siga
-- tentando) e o fluxo manda `resposta` verbatim.
--
-- Os três botões são os que a Meta APROVOU no `vaga_que_voce_pediu`
-- (QUICK_REPLY): `Sim`, `Esse nao serve`, `Sair da espera`. Texto de botão novo
-- exige submissão nova, então a régua aqui casa com estes três e mais nada.
--
-- Nenhuma checagem de quem chama, mesmo desenho do `confirmar_vaga_da_fila`:
-- quem chama é a edge com `service_role`, para quem `private.salon_ids()` não
-- devolve nada. A porta é o `grant`.
create or replace function public.responder_vaga_da_fila(
  p_message_id text,
  p_botao text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila uuid;
  v_salon uuid;
  v_client uuid;
  v_status text;
  v_reserva uuid;
  v_respondido timestamptz;
  v_botao text;
  v_cliente text;
  v_r jsonb;
  v_depois text;
begin
  if p_message_id is null or p_botao is null then
    return jsonb_build_object('atendido', false);
  end if;

  select a.fila_id, a.respondido_em, f.salon_id, f.client_id, f.status, f.appointment_id
    into v_fila, v_respondido, v_salon, v_client, v_status, v_reserva
    from public.fila_avisos a
    join public.fila_de_espera f on f.id = a.fila_id
   where a.message_id = p_message_id;

  -- Nao e aviso de fila: a edge segue para o opt-out e para o console.error.
  if v_fila is null then
    return jsonb_build_object('atendido', false);
  end if;

  -- Clique repetido no MESMO aviso. Nao refaz nada e nao fala de novo: calar
  -- aqui e melhor do que contar duas historias sobre o mesmo horario.
  if v_respondido is not null then
    return jsonb_build_object('atendido', true, 'acao', 'repetido',
      'salon_id', v_salon, 'resposta', null);
  end if;

  v_botao := lower(translate(p_botao,
    'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'));

  select coalesce(split_part(c.nome, ' ', 1), '') into v_cliente
    from public.clients c where c.id = v_client;

  ----------------------------------------------------------------------------
  -- "Sim" -- confirma a vaga segurada
  ----------------------------------------------------------------------------
  if v_botao like 'sim%' then
    -- A regra mora na `confirmar_vaga_da_fila`, nao aqui: duas copias da mesma
    -- regra e como elas divergem. Ela ja trata prazo vencido e reserva desfeita.
    v_r := public.confirmar_vaga_da_fila(v_fila);

    update public.fila_avisos
       set respondido_em = now(), botao = p_botao
     where message_id = p_message_id;

    if coalesce((v_r->>'ok')::boolean, false) then
      return jsonb_build_object('atendido', true, 'acao', 'fila_confirmado',
        'salon_id', v_salon, 'appointment_id', v_r->>'appointment_id',
        'resposta', 'Fechado, ' || v_cliente || '! Seu horario ' || (v_r->>'quando')
                    || ' as ' || (v_r->>'hora_local')
                    || coalesce(' com ' || (v_r->>'profissional'), '')
                    || ' esta confirmado. Ate logo!');
    end if;

    -- Entre o aviso e o "quero" o prazo pode ter vencido, e a varredura ja
    -- desfez a reserva. O que dizer depende do que SOBROU da inscricao: ainda
    -- esperando e uma promessa que da para cumprir; encerrada, nao e.
    select f.status into v_depois from public.fila_de_espera f where f.id = v_fila;
    if v_depois = 'esperando' then
      return jsonb_build_object('atendido', true, 'acao', 'fila_vaga_perdida',
        'salon_id', v_salon,
        'resposta', 'Puxa, ' || v_cliente || ', esse horario acabou de sair. '
                    || 'Voce segue na fila e eu te aviso se abrir outro.');
    end if;
    return jsonb_build_object('atendido', true, 'acao', 'fila_vaga_perdida',
      'salon_id', v_salon,
      'resposta', 'Puxa, ' || v_cliente || ', esse horario acabou de sair e sua '
                  || 'espera ja tinha encerrado. Se quiser, me chame que eu procuro de novo.');
  end if;

  ----------------------------------------------------------------------------
  -- "Esse nao serve" -- devolve a vaga e CONTINUA esperando
  ----------------------------------------------------------------------------
  if v_botao like '%nao serve%' or v_botao like '%nao da%' then
    update public.fila_avisos
       set respondido_em = now(), botao = p_botao
     where message_id = p_message_id;

    if v_status <> 'chamado' then
      return jsonb_build_object('atendido', true, 'acao', 'fila_sem_vaga',
        'salon_id', v_salon,
        'resposta', 'Tudo bem, ' || v_cliente || '! Esse horario ja tinha saido. '
                    || 'Te aviso na proxima vaga.');
    end if;

    -- Devolve a vaga NA HORA, como o `sair_da_fila` faz: o horario pode ser o da
    -- proxima pessoa da fila, e esperar a varredura o prenderia por 30 minutos.
    update public.fila_de_espera
       set status = 'esperando', appointment_id = null
     where id = v_fila;

    if v_reserva is not null then
      delete from public.appointments
       where id = v_reserva and status = 'reservado';
    end if;

    -- `chamadas` NAO sobe. O contador existe para chamada PERDIDA ("a pessoa
    -- podia estar no banho"), e duas delas encerram a inscricao. Queimar uma
    -- ficha de quem respondeu encerraria a espera de quem esta participando --
    -- o mesmo dano de ligar a varredura sem aviso. Quem quer sair tem botao.
    return jsonb_build_object('atendido', true, 'acao', 'fila_recusou',
      'salon_id', v_salon,
      'resposta', 'Beleza, ' || v_cliente || '! Deixei esse passar e voce segue '
                  || 'na fila. Te aviso quando abrir outro.');
  end if;

  ----------------------------------------------------------------------------
  -- "Sair da espera" -- encerra a inscrição
  ----------------------------------------------------------------------------
  -- Nao colide com o opt-out de LGPD: o `ehPedidoDeSaida` compara a MENSAGEM
  -- INTEIRA contra um conjunto exato, e "sair da espera" nao esta nele. Sair da
  -- fila e sair daquela espera, nao de todo contato -- confundir os dois tiraria
  -- a pessoa de lembrete e avaliacao sem ela ter pedido.
  if v_botao like '%sair%' or v_botao like '%nao quero mais esperar%' then
    update public.fila_avisos
       set respondido_em = now(), botao = p_botao
     where message_id = p_message_id;

    v_r := public.sair_da_fila(v_fila, 'saiu');

    return jsonb_build_object('atendido', true, 'acao', 'fila_saiu',
      'salon_id', v_salon,
      'resposta', 'Tudo bem, ' || v_cliente || '! Te tirei da fila de espera. '
                  || 'Quando quiser marcar, e so me chamar aqui.');
  end if;

  -- Botao que nao e nenhum dos tres: nao e nossa. Devolver `false` deixa a edge
  -- seguir para o opt-out, que e justamente o caso do "Nao quero mais receber".
  return jsonb_build_object('atendido', false);
end;
$function$;

revoke all on function public.responder_vaga_da_fila(text, text) from public, anon, authenticated;
grant execute on function public.responder_vaga_da_fila(text, text) to service_role;

comment on function public.responder_vaga_da_fila(text, text) is
  'A ponte do clique no aviso da fila, no mesmo formato da responder_lembrete (atendido=false significa "nao e minha, siga tentando"). Resolve a inscricao pelo WAMID -- e por isso funciona com N barbearias saindo do mesmo numero central, onde o telefone nao desempata. Os tres botoes sao os que a Meta aprovou: Sim (confirma, delegando a regra ao confirmar_vaga_da_fila), Esse nao serve (devolve a vaga NA HORA e continua esperando, sem subir `chamadas`, que e contador de chamada PERDIDA), Sair da espera (encerra, sem se confundir com o opt-out de LGPD). Cada ramo devolve o texto PRONTO, porque formatar no fluxo faz o modelo montar frase a partir de ISO.';

------------------------------------------------------------------------------
-- 4. A varredura, com a trava do laço
------------------------------------------------------------------------------
create or replace function private.chamar_proximos_da_fila(
  p_limite integer default 20,
  p_minutos_de_reserva integer default 30
)
returns table (
  fila_id uuid,
  salon_id uuid,
  barbearia text,
  client_id uuid,
  cliente text,
  telefone text,
  -- `reserva_id`, e nao `appointment_id`: nome de coluna de saida em `returns
  -- table` vira VARIAVEL dentro do corpo e sombreia a coluna homonima. Com
  -- `appointment_id` aqui, o `on conflict (appointment_id, service_id)` do
  -- insert abaixo levantava 42702 (referencia ambigua) -- pego rodando, nao
  -- lendo. De quebra o nome ficou mais honesto: o que volta e a RESERVA.
  reserva_id uuid,
  profissional text,
  data_local text,
  hora_local text,
  reservada_ate timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_f record;
  v_minutos int;
  v_quem uuid[];
  v_dia date;
  v_vaga record;
  v_ag uuid;
  v_chamados int := 0;
begin
  for v_f in
    select f.id, f.salon_id, f.client_id, f.professional_id, f.de, f.ate,
           f.hora_de, f.hora_ate
      from public.fila_de_espera f
     where f.status = 'esperando'
     order by f.criada_em
     limit p_limite
  loop
    -- A duracao do que ela espera fazer.
    select sum(s.duracao_minutos)::int into v_minutos
      from public.fila_de_espera_servicos fs
      join public.services s on s.id = fs.service_id and s.ativo
     where fs.fila_id = v_f.id;

    -- Servico desativado depois da inscricao: ela nao casa com nada. Deixa para
    -- o dono resolver na tela em vez de encerrar por conta propria -- quem
    -- desativou o servico foi a barbearia, nao o cliente.
    if coalesce(v_minutos, 0) <= 0 then
      continue;
    end if;

    -- Quem faz TODOS os servicos dela (regua da 0199; lista vazia = faz todos).
    select array_agg(p.id) into v_quem
      from public.professionals p
     where p.salon_id = v_f.salon_id
       and p.ativo
       and (v_f.professional_id is null or p.id = v_f.professional_id)
       and (
         not exists (select 1 from public.professional_services x
                      where x.professional_id = p.id)
         or not exists (
              select 1 from public.fila_de_espera_servicos fs
               where fs.fila_id = v_f.id
                 and not exists (select 1 from public.professional_services x
                                  where x.professional_id = p.id
                                    and x.service_id = fs.service_id))
       );

    if v_quem is null or array_length(v_quem, 1) = 0 then
      continue;
    end if;

    v_ag := null;

    -- Dia por dia, do primeiro ao ultimo da faixa. Para numa vaga que entre.
    for v_dia in
      select g::date
        from generate_series(greatest(v_f.de, v_hoje)::timestamp,
                             v_f.ate::timestamp, interval '1 day') g
    loop
      exit when v_ag is not null;

      for v_vaga in
        select h.professional_id, h.profissional, h.inicio, h.hora_local
          from public.horarios_livres(v_f.salon_id, v_dia, v_minutos,
                                      v_f.professional_id) h
         where h.professional_id = any(v_quem)
           and (v_f.hora_de is null
                or (h.inicio at time zone v_tz)::time >= v_f.hora_de)
           and (v_f.hora_ate is null
                or ((h.inicio + make_interval(mins => v_minutos))
                     at time zone v_tz)::time <= v_f.hora_ate)
           -- A trava do laco: horario que JA foi oferecido a esta inscricao nao
           -- volta. Sem isto, "Esse nao serve" devolve a vaga e a varredura
           -- seguinte oferece o MESMO horario -- um template pago por volta.
           and not exists (
             select 1 from public.fila_avisos fa
              where fa.fila_id = v_f.id and fa.inicio = h.inicio)
         order by h.inicio
         limit 5
      loop
        begin
          -- `data_hora_fim` vai EXPLICITO, como no agendar_pelo_agente. O
          -- trigger calcula_fim_do_agendamento deriva o fim do servico
          -- PRINCIPAL, e a inscricao pode ter dois: a vaga foi validada para
          -- corte+barba (50 min) e a reserva nasceria de 30, liberando meia
          -- hora que nao existe para a proxima pessoa da fila.
          insert into public.appointments
            (salon_id, client_id, professional_id, service_id,
             data_hora_inicio, data_hora_fim, status, origem, reservada_ate)
          select v_f.salon_id, v_f.client_id, v_vaga.professional_id,
                 (select fs.service_id from public.fila_de_espera_servicos fs
                   where fs.fila_id = v_f.id order by fs.ordem limit 1),
                 v_vaga.inicio,
                 v_vaga.inicio + make_interval(mins => v_minutos),
                 'reservado', 'fila',
                 now() + make_interval(mins => p_minutos_de_reserva)
          returning id into v_ag;

          -- Os demais servicos da inscricao. O principal ja foi espelhado pelo
          -- trigger trg_espelha_servico_principal, e por isso o `on conflict`:
          -- reinserir levantaria 23505 e derrubaria a chamada inteira.
          insert into public.appointment_services (appointment_id, service_id, ordem)
          select v_ag, fs.service_id, fs.ordem
            from public.fila_de_espera_servicos fs
           where fs.fila_id = v_f.id
          on conflict (appointment_id, service_id) do nothing;

          exit;
        exception when sqlstate '23P01' then
          -- Trava por CLIENTE: ele ja tem horario exatamente nessa hora. Tenta a
          -- proxima vaga -- desistir da inscricao por causa disso seria punir
          -- quem esperou.
          v_ag := null;
        end;
      end loop;
    end loop;

    if v_ag is null then
      continue;
    end if;

    update public.fila_de_espera
       set status = 'chamado', chamada_em = now(), appointment_id = v_ag
     where id = v_f.id;

    v_chamados := v_chamados + 1;

    return query
    select v_f.id, v_f.salon_id, s.nome, v_f.client_id, c.nome, c.telefone,
           a.id, p.nome,
           to_char(a.data_hora_inicio at time zone v_tz, 'DD/MM'),
           to_char(a.data_hora_inicio at time zone v_tz, 'HH24:MI'),
           a.reservada_ate
      from public.appointments a
      join public.salons s on s.id = a.salon_id
      join public.clients c on c.id = a.client_id
      join public.professionals p on p.id = a.professional_id
     where a.id = v_ag;
  end loop;
end;
$function$;

revoke all on function private.chamar_proximos_da_fila(integer, integer) from public, anon, authenticated;
grant execute on function private.chamar_proximos_da_fila(integer, integer) to service_role;

comment on function private.chamar_proximos_da_fila(integer, integer) is
  'Pergunta, para cada inscricao esperando, se existe vaga que caiba -- e nunca oferece o mesmo inicio DUAS vezes a mesma inscricao (trava da 0209: sem ela, "Esse nao serve" devolve a vaga e a varredura seguinte a oferece de novo, um template pago por volta). A regra de vaga vem do horarios_livres, a mesma da agenda publica e do agente.';

notify pgrst, 'reload schema';
