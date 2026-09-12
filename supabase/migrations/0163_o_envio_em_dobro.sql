-- 0163: o envio em dobro (Fase 5 — achado M12).
--
-- O BURACO. As filas são lidas pelo n8n, enviadas, e só ENTÃO marcadas. Entre
-- ler e marcar não havia reserva nenhuma: `for update skip locked` aparece zero
-- vezes nas 162 migrations. Duas execuções sobrepostas do mesmo fluxo — uma que
-- passou dos 30 minutos do Schedule, ou uma rodada à mão — leem as mesmas linhas
-- e mandam duas vezes para a mesma pessoa.
--
-- E na reativação é pior que incômodo: `marcar_reativacao_enviada` também faz
-- `reativacao_sem_resposta + 1`, e a pausa automática dispara em 2. **O envio
-- duplicado pausa a reativação de um cliente que respondeu normalmente** — o
-- sistema decide sozinho parar de convidar alguém por causa de um defeito
-- nosso, e ninguém nunca fica sabendo.
--
-- O `on conflict (message_id)` da avaliação não protege disso: o `message_id` é
-- o wamid que a Meta devolve, diferente a cada envio. Ele protege contra
-- registrar o MESMO envio duas vezes, não contra enviar duas.
--
-- A RESERVA COM PRAZO. A linha de origem ganha `envio_reservado_ate`, e quem vai
-- enviar chama uma função que RESERVA e devolve o que conseguiu reservar. As
-- filas param de mostrar o que está reservado, então a segunda execução não vê
-- nada.
--
-- O prazo é de 5 minutos, decidido pelo dono em 12/09. É ele que faz uma
-- execução que morreu no meio devolver as linhas sozinha, em vez de travá-las
-- para sempre. O número precisa ser maior que a execução mais lenta: se um envio
-- demorar mais de 5 minutos, a linha volta para a fila e pode sair em dobro do
-- mesmo jeito.
--
-- POR QUE O `UPDATE ... RETURNING` É A TRAVA, e não o `for update skip locked`.
-- O que garante a exclusividade é o próprio UPDATE: duas transações não
-- atualizam a mesma linha ao mesmo tempo: a segunda espera, e quando o lock sai
-- ela RE-AVALIA o `where`, que agora tem `envio_reservado_ate` no futuro e não
-- casa mais. Ela volta com zero linhas. O `skip locked` seria otimização (não
-- esperar), não correção — e por isso não está aqui: menos mágica para a próxima
-- pessoa entender.
--
-- POR QUE O CTE CAPTURA A LINHA ANTES. `alvo` guarda a linha inteira da fila
-- ANTES do update; `reservados` diz quais reservas de fato venceram. O resultado
-- é o `join` dos dois. Escrito assim, não depende de quem enxerga o quê dentro
-- da mesma instrução — o que seria correto em PostgreSQL, mas sutil demais para
-- confiar num código que decide se um cliente recebe mensagem.
--
-- O QUE FICOU DE FORA, de propósito: o LEMBRETE. Ele não tem view nem RPC — o
-- fluxo consulta `appointments` direto —, e é a funcionalidade mais usada do
-- produto. Mexer nele no mesmo PR que mexe em outros dois fluxos vivos multiplica
-- o risco sem necessidade: o pior caso dele é o cliente receber o mesmo lembrete
-- duas vezes, enquanto o da reativação é o cliente ser silenciado para sempre.
-- Fica para um PR próprio.

alter table public.orders
  add column if not exists envio_reservado_ate timestamptz;

comment on column public.orders.envio_reservado_ate is
  'Ate quando esta comanda esta reservada por uma execucao de envio da fila de avaliacao. Passado ou nulo = livre. Prazo de 5 min: execucao que morreu devolve a linha sozinha (0163).';

alter table public.appointments
  add column if not exists envio_reservado_ate timestamptz;

comment on column public.appointments.envio_reservado_ate is
  'Ate quando este agendamento esta reservado por uma execucao de envio da fila de reativacao. Passado ou nulo = livre. Prazo de 5 min (0163).';

-- ---------------------------------------------------------------------------
-- As filas param de mostrar o que já está reservado
-- ---------------------------------------------------------------------------
-- Definições da 0158, com uma linha a mais em cada WHERE.
create or replace view public.avaliacoes_a_pedir
with (security_invoker = on) as
select o.id as order_id,
       o.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       private.destino_whatsapp(coalesce(c.telefone, '')) as destino,
       'cloud_api'::text as provedor,
       rem.phone_number_id,
       t.nome_meta as template,
       t.idioma as template_idioma,
       jsonb_build_array(split_part(c.nome, ' ', 1), s.nome) as template_parametros
  from public.orders o
  join public.clients c on c.id = o.client_id
  join public.salons s on s.id = o.salon_id
  join public.salons_com_automacao sa on sa.id = o.salon_id
  join lateral (
    select r.phone_number_id from public.remetentes_oficiais r
     where r.ativo
     order by (r.phone_number_id = s.remetente_phone_number_id) desc, r.criado_em
     limit 1
  ) rem on true
  join public.whatsapp_templates t
    on t.chave = 'avaliacao_pos_atendimento' and t.status = 'aprovado' and t.ativo
 where o.status = 'fechada'
   and o.closed_at >= now() - interval '26 hours'
   and o.closed_at <= now() - interval '2 hours'
   and not c.recusou_contato
   and length(private.destino_whatsapp(coalesce(c.telefone, ''))) >= 12
   and (c.avaliacao_pedida_em is null or c.avaliacao_pedida_em < now() - interval '56 days')
   and private.hora_de_falar()
   and (o.envio_reservado_ate is null or o.envio_reservado_ate < now())
   and exists (
     select 1 from public.order_items oi
      where oi.order_id = o.id and oi.tipo = 'servico'
   )
   and (o.appointment_id is null or exists (
     select 1 from public.appointments ap
      where ap.id = o.appointment_id and ap.status not in ('cancelado', 'faltou')
   ));

comment on view public.avaliacoes_a_pedir is
  'Fila da avaliacao pos-atendimento. So sai quem teve servico de verdade na comanda (M5), so dentro da janela de 9h as 20h (M4) e so o que nao esta reservado por outra execucao (M12).';

create or replace view public.reativacoes_a_enviar
with (security_invoker = on) as
select a.id as appointment_id,
       a.salon_id,
       s.nome as barbearia,
       c.id as client_id,
       split_part(c.nome, ' ', 1) as cliente,
       c.telefone_norm,
       c.reativacao_sem_resposta,
       p.nome as barbeiro,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'DD/MM') as data,
       to_char((a.data_hora_inicio at time zone 'America/Sao_Paulo'), 'HH24:MI') as hora,
       private.destino_whatsapp(c.telefone) as destino
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.salons s on s.id = a.salon_id
  join public.salons_com_automacao sa on sa.id = a.salon_id
  join public.professionals p on p.id = a.professional_id and p.ativo
 where a.origem = 'reativacao'
   and a.status = 'agendado'
   and not a.confirmacao_enviada
   and a.data_hora_inicio >= now() + interval '2 hours'
   and a.data_hora_inicio <= now() + interval '26 hours'
   and not c.recusou_contato
   and c.reativacao_pausada_em is null
   and private.destino_whatsapp(c.telefone) is not null
   and private.hora_de_falar()
   and (a.envio_reservado_ate is null or a.envio_reservado_ate < now())
   and not exists (
     select 1 from public.appointments o
      where o.client_id = c.id
        and o.id <> a.id
        and o.status in ('agendado', 'confirmado')
        and o.data_hora_inicio > now()
   );

comment on view public.reativacoes_a_enviar is
  'Fila do convite de reativacao. Barbearia com automacao, barbeiro na equipe, cliente sem outro horario futuro, dentro da janela de 9h as 20h, e fora de reserva de outra execucao (M12).';

-- ---------------------------------------------------------------------------
-- Quem vai enviar, reserva
-- ---------------------------------------------------------------------------
create or replace function public.reservar_avaliacoes(p_limite integer default 50)
returns setof public.avaliacoes_a_pedir
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with alvo as (
    select a.* from public.avaliacoes_a_pedir a limit greatest(p_limite, 1)
  ),
  reservados as (
    update public.orders o
       set envio_reservado_ate = now() + interval '5 minutes'
     where o.id in (select alvo.order_id from alvo)
       and (o.envio_reservado_ate is null or o.envio_reservado_ate < now())
    returning o.id
  )
  select alvo.* from alvo join reservados on reservados.id = alvo.order_id;
$$;

comment on function public.reservar_avaliacoes(integer) is
  'Reserva por 5 minutos e devolve as avaliacoes que ESTA execucao pode enviar. Duas execucoes ao mesmo tempo nunca recebem a mesma linha: o UPDATE e a trava, e a segunda re-avalia o where depois do lock e volta vazia. 0163, M12.';

revoke all on function public.reservar_avaliacoes(integer) from public, anon, authenticated;
grant execute on function public.reservar_avaliacoes(integer) to service_role;

create or replace function public.reservar_reativacoes(p_limite integer default 50)
returns setof public.reativacoes_a_enviar
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with alvo as (
    select r.* from public.reativacoes_a_enviar r limit greatest(p_limite, 1)
  ),
  reservados as (
    update public.appointments a
       set envio_reservado_ate = now() + interval '5 minutes'
     where a.id in (select alvo.appointment_id from alvo)
       and (a.envio_reservado_ate is null or a.envio_reservado_ate < now())
    returning a.id
  )
  select alvo.* from alvo join reservados on reservados.id = alvo.appointment_id;
$$;

comment on function public.reservar_reativacoes(integer) is
  'Reserva por 5 minutos e devolve os convites de reativacao que ESTA execucao pode enviar. Sem isto, duas execucoes sobrepostas mandavam o mesmo convite duas vezes e o `reativacao_sem_resposta + 1` de cada uma pausava um cliente que tinha respondido. 0163, M12.';

revoke all on function public.reservar_reativacoes(integer) from public, anon, authenticated;
grant execute on function public.reservar_reativacoes(integer) to service_role;
