-- O destino do aviso sai da régua da casa, e quem não tem destino não é chamado.
--
-- Escrevendo o remetente da fila no n8n eu precisei do telefone para mandar o
-- template, e a `chamar_proximos_da_fila` devolvia `c.telefone` **cru**. Fui ver
-- como o fluxo de Reativação monta o destino dele e achei a régua que já existe:
--
--     private.destino_whatsapp(p_telefone)
--       -- 10 ou 11 digitos (o que o balcao digita) -> ganha o 55
--       -- 12 ou 13 digitos (o que o WhatsApp entrega) -> passa como esta
--       -- qualquer outra coisa -> NULO
--
-- Montar número no fluxo seria a segunda cópia dessa regra, e o comentário dela
-- diz qual é o erro que isso produz: *"somar outro 55 aqui é o defeito"*.
--
-- ## E o NULO abriu um furo que eu não tinha visto
--
-- A régua devolve nulo quando não dá para montar destino, e o comentário dela
-- explica o porquê: *"a linha some da fila em vez de virar mensagem cobrada para
-- um número que não existe"*.
--
-- **Qual é o caso real, medido:** telefone com lixo (`'123'`) **não existe** —
-- o CHECK `clients_telefone_valido` o recusa na porta. Mas ele é
-- `telefone IS NULL OR private.telefone_valido(telefone)`, ou seja, **nulo
-- passa de propósito**. Então o caso alcançável é cliente **sem** telefone.
-- Hoje são 0 de 120 clientes, e isso não torna o caminho inexistente: a coluna
-- aceita nulo e nada impede o próximo cadastro de vir sem número.
--
-- E na fila, sumir só do envio não bastaria. A inscrição seria chamada do mesmo
-- jeito: reserva criada, 30 minutos de um horário preso, nenhum aviso saindo, e
-- duas varreduras depois a `devolver_chamados_sem_resposta` somaria 1 duas vezes
-- e **encerraria a inscrição de quem nunca soube** — exatamente o dano que já
-- está registrado como motivo de o varredor ficar desligado.
--
-- Então a decisão é mais cedo: **quem não tem destino montável não é chamado.**
-- Fica `esperando`, aparece na tela do dono com o telefone à mostra, e o dono
-- liga à mão. A fila não promete o que não pode cumprir.
--
-- ## Por que `drop` e não `create or replace`
--
-- Acrescentar coluna em `returns table` muda a assinatura, e `create or replace`
-- levanta 42P13 — a mesma lição que o `reserva_id` da 0205 já custou. O `drop`
-- é seguro aqui porque quem chama é função (`rodar_a_fila`), que resolve o nome
-- em tempo de execução, e não view. O `to_jsonb(c)` da fachada pega a coluna
-- nova sozinho: `rodar_a_fila` não muda.

drop function if exists private.chamar_proximos_da_fila(integer, integer);

create function private.chamar_proximos_da_fila(
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
  -- O destino pronto, pela regua da casa (`private.destino_whatsapp`): sem DDI
  -- ganha o 55, com DDI passa como esta. O fluxo NAO monta numero -- somar outro
  -- 55 a mao e o defeito que a funcao existe para evitar.
  destino text,
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

    -- Sem destino montavel, esta pessoa NAO pode ser avisada pelo numero
    -- central. Chamar aqui criaria reserva de 30 minutos para quem nunca
    -- receberia o aviso e, duas varreduras depois, a inscricao se encerraria em
    -- silencio (`devolver_chamados_sem_resposta` soma 1 e a segunda encerra) --
    -- tirando da fila quem nunca soube. Fica `esperando`, visivel na tela do
    -- dono com o telefone a mostra, que liga a mao.
    if (select private.destino_whatsapp(c.telefone)
          from public.clients c where c.id = v_f.client_id) is null then
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
           private.destino_whatsapp(c.telefone),
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
  'Pergunta, para cada inscricao esperando, se existe vaga que caiba. Tres regras moram aqui: nunca oferece o mesmo inicio DUAS vezes a mesma inscricao (0209); nao chama quem nao tem destino de WhatsApp montavel pela private.destino_whatsapp (0210), porque chamar criaria reserva de 30 min para quem nunca receberia o aviso e duas varreduras depois encerraria a inscricao em silencio -- fica esperando, na tela do dono, que liga a mao; e a regua de vaga vem do horarios_livres, a mesma da agenda publica e do agente. Devolve `destino` pronto para o fluxo, que NAO monta numero.';

notify pgrst, 'reload schema';
