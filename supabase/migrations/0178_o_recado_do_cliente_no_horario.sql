-- 0178: o recado do cliente no horário (fase 4 — "e produto?").
--
-- A SEGUNDA METADE DO PEDIDO DE 21/09: "não consegue alterar seu agendamento,
-- adicionar serviço ou produto pelo whatsapp". Serviço foi resolvido nas fases
-- 1 a 3. Produto é outra natureza, e a diferença importa:
--
--   · SERVIÇO ocupa cadeira. Ele tem duração, entra na grade, e por isso
--     precisa de validação de vaga — foi o que as RPCs da 0176 fizeram.
--   · PRODUTO é estoque e dinheiro. Vender pelo chat exigiria cobrar pelo
--     chat, e a plataforma não cobra do cliente final; e prometer unidade que
--     talvez não esteja na prateleira é pior do que não prometer nada.
--
-- Então o agente NÃO vende: ele ANOTA. "Separar uma pomada" fica gravado no
-- horário, o barbeiro lê antes de atender e lança na comanda com o cliente na
-- frente — onde o estoque é real e o pagamento acontece.
--
-- O CAMPO É DE RECADO, NÃO DE PRODUTO, de propósito. Um `appointment_products`
-- estruturado prometeria preço e estoque, e obrigaria o cliente a falar em
-- SKU. O que o cliente escreve é "separa aquela pomada" ou "quero cortar mais
-- curto que a última vez" — e as duas coisas servem ao barbeiro pelo mesmo
-- caminho. Recado livre cobre o pedido de produto e mais.
--
-- REGRAS (mais frouxas que as de serviço, e isso é intencional):
--   · horário DE PÉ e no futuro;
--   · SEM o piso de 30 minutos. Esticar a cadeira em cima da hora atrapalha o
--     barbeiro; avisar "separa a pomada, chego em 20 min" ajuda. A régua tem
--     de seguir o efeito, não a simetria.
--   · 280 caracteres, recusado com motivo (o agente resume e reenvia) em vez
--     de truncado em silêncio — recado cortado no meio mente para o barbeiro.
--   · recado vazio LIMPA: o cliente muda de ideia, e desfazer é um caminho.

alter table public.appointments
  add column if not exists recado_do_cliente text,
  add column if not exists recado_em timestamptz;

-- O CHECK é a última linha: a RPC já recusa, mas ela não é o único caminho
-- (CRM e service_role escrevem direto), e texto sem teto numa coluna que vai
-- para a tela do barbeiro é despejo esperando acontecer.
alter table public.appointments
  drop constraint if exists appointments_recado_tamanho;
alter table public.appointments
  add constraint appointments_recado_tamanho
  check (recado_do_cliente is null or length(recado_do_cliente) <= 280);

comment on column public.appointments.recado_do_cliente is
  'O que o CLIENTE pediu por fora dos servicos: "separar uma pomada", "cortar mais curto". Escrito pelo agente do WhatsApp (0178) e lido pelo barbeiro na agenda e no Concluir e cobrar. Produto NAO se vende pelo chat -- isto e recado, nao comanda.';
comment on column public.appointments.recado_em is
  'Quando o recado foi escrito. Serve para o barbeiro saber se o pedido veio antes ou depois de ele ja ter olhado o horario.';

-- ---------------------------------------------------------------------------
-- A RPC do recado
-- ---------------------------------------------------------------------------
create or replace function public.anotar_recado_pelo_cliente(
  p_appointment_id uuid,
  p_recado text,
  p_client_id uuid default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_ag public.appointments%rowtype;
  v_limpo text;
begin
  if p_client_id is null and p_token is null then
    raise exception 'Sem autorizacao: informe p_client_id ou p_token.'
      using errcode = '42501';
  end if;

  select * into v_ag
    from public.appointments a
   where a.id = p_appointment_id
     and (p_token is null or a.token_gestao = p_token)
     and (p_client_id is null or a.client_id = p_client_id)
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado.' using errcode = '42501';
  end if;

  if v_ag.status not in ('agendado', 'confirmado') then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario ja nao esta mais de pe.');
  end if;
  -- Horário que já passou não recebe recado: ninguém vai ler.
  if v_ag.data_hora_inicio <= now() then
    return jsonb_build_object('ok', false,
      'motivo', 'Esse horario ja comecou. Fale direto com a barbearia.');
  end if;

  v_limpo := nullif(btrim(coalesce(p_recado, '')), '');

  if v_limpo is not null and length(v_limpo) > 280 then
    return jsonb_build_object('ok', false,
      'motivo', 'Recado longo demais (o limite e 280 caracteres). Resuma o pedido e mande de novo.');
  end if;

  update public.appointments
     set recado_do_cliente = v_limpo,
         -- Limpar o recado limpa o carimbo: data de recado sem recado é
         -- informação que não corresponde a nada.
         recado_em = case when v_limpo is null then null else now() end
   where id = v_ag.id;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_ag.id,
    'recado', v_limpo,
    'apagado', v_limpo is null,
    'inicio', to_char(v_ag.data_hora_inicio at time zone v_tz, 'DD/MM/YYYY HH24:MI')
  );
end;
$$;

comment on function public.anotar_recado_pelo_cliente(uuid, text, uuid, uuid) is
  'Grava o pedido do cliente por fora dos servicos ("separar uma pomada") no horario dele, para o barbeiro ler na agenda e lancar na comanda no balcao. Porta do CLIENTE (agente por p_client_id, link de gestao por p_token). Sem piso de 30min de proposito: avisar em cima da hora AJUDA o barbeiro, ao contrario de esticar a cadeira. Recado vazio apaga. Acima de 280 caracteres volta {ok:false} para o agente resumir.';

revoke execute on function public.anotar_recado_pelo_cliente(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.anotar_recado_pelo_cliente(uuid, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- A view do agente passa a carregar o recado
-- ---------------------------------------------------------------------------
-- DROP E RECRIA, reproduzindo TUDO: coluna nova no meio de uma lista levanta
-- 42P16 num `create or replace`, e `replace` perde em silêncio o que não for
-- redigitado (`security_invoker`, os revokes). As duas coisas já custaram
-- tempo neste projeto — a 0171 recriou por inteiro pela mesma razão.
--
-- O recado entra AQUI porque o agente lê o horário do cliente por esta view:
-- sem ele, o agente anotaria "separar pomada" por cima de um pedido que já
-- existe, ou repetiria a pergunta que o cliente já respondeu.
drop view if exists public.agendamentos_do_cliente;

create view public.agendamentos_do_cliente
with (security_invoker = on) as
select a.id,
       a.salon_id,
       a.client_id,
       a.professional_id,
       a.service_id,
       a.status,
       a.data_hora_inicio,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data_local,
       to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_local,
       case
         when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
              = (now() at time zone 'America/Sao_Paulo')::date
           then 'hoje'
         when (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date
              = (now() at time zone 'America/Sao_Paulo')::date + 1
           then 'amanha'
         else 'dia ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
       end as quando,
       -- Todos os serviços, na ordem em que foram escolhidos. O fallback é o
       -- serviço principal: agendamento criado pelo CRM ou pelo agente não
       -- preenche `appointment_services`.
       coalesce(
         (select string_agg(s2.nome, ' + ' order by asv.ordem)
            from public.appointment_services asv
            join public.services s2 on s2.id = asv.service_id
           where asv.appointment_id = a.id),
         s.nome
       ) as servico,
       p.nome as profissional,
       (a.status in ('agendado', 'confirmado')) as de_pe,
       -- 0178: o pedido por fora dos serviços, para o agente não anotar duas
       -- vezes nem perguntar o que já foi respondido.
       a.recado_do_cliente as recado
  from public.appointments a
  left join public.services s on s.id = a.service_id
  left join public.professionals p on p.id = a.professional_id;

comment on view public.agendamentos_do_cliente is
  'Os horarios de um cliente ja em horario de Sao Paulo, para o agente do WhatsApp nunca converter fuso de cabeca. `servico` soma os servicos de appointment_services (0171); `de_pe` diz o que ainda esta marcado -- filtre por ele, e nao por status, para nao anunciar horario concluido ou faltou; `recado` traz o pedido por fora dos servicos (0178).';

revoke all on public.agendamentos_do_cliente from anon;
grant select on public.agendamentos_do_cliente to authenticated, service_role;
