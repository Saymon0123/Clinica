-- 0168: a barbearia fica sabendo quando o CLIENTE cancela (etapa 6 do QR v2).
--
-- O BURACO. O cancelamento pelo link só fazia `update` do status, e nenhum
-- gatilho de `appointments` falava para fora (conferido em 11/09 e de novo em
-- 13/09). Quem está com o CRM aberto vê o bloco sumir da agenda — o canal de
-- realtime já existe. Quem fechou o CRM às 19h não fica sabendo de nada: chega
-- no dia seguinte e a cadeira está vazia sem explicação.
--
-- A ETAPA 3 PIOROU ISSO DE PROPÓSITO. Guardar o horário no celular existe
-- justamente para a pessoa cancelar sozinha, sem falar com ninguém. Facilitar o
-- cancelamento silencioso sem construir o aviso seria entregar metade.
--
-- ─── Por que INFERIR quem cancelou, em vez de marcar em cada chamador ───────
--
-- Os caminhos que cancelam são pelo menos cinco: o link público (edge), o botão
-- do lembrete (`responder_lembrete`), o CRM, o agente do WhatsApp pelo n8n, e o
-- cron de reativação. Marcar um a um significa que o próximo caminho — ou o que
-- eu não encontrei — nasce sem marca, e o aviso simplesmente não aparece. Um
-- aviso que falha em silêncio é pior que não ter aviso: o dono passa a confiar
-- nele.
--
-- `auth.uid()` responde a pergunta certa numa linha: QUEM está falando com o
-- banco. Sessão de usuário logado (só o CRM tem) devolve o id; service_role,
-- edge, n8n e pg_cron devolvem nulo. Fora do CRM, quem cancela é o cliente.
--
-- A EXCEÇÃO É O CRON e ela é explícita: `expira_reativacoes_sem_resposta` roda
-- sem sessão e cancelaria "como cliente" — mas ali ninguém cancelou nada, o
-- convite automático é que venceu sem resposta. Marcar isso como cancelamento
-- do cliente encheria o aviso do dono de ruído todo dia, e ele pararia de olhar.

alter table public.appointments
  add column if not exists cancelado_por text,
  add column if not exists cancelamento_visto_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_cancelado_por_valido') then
    alter table public.appointments
      add constraint appointments_cancelado_por_valido
      check (cancelado_por is null or cancelado_por in ('cliente', 'barbearia', 'sistema'));
  end if;
end $$;

comment on column public.appointments.cancelado_por is
  'Quem cancelou, inferido por carimba_cancelamento a partir de auth.uid(): sessao logada = barbearia, o resto = cliente. O cron de reativacao marca sistema explicitamente. NULO nos cancelamentos anteriores a 13/09/2026 -- de proposito: backfill inventaria um culpado e encheria o aviso do dono de ruido no primeiro dia.';

comment on column public.appointments.cancelamento_visto_em is
  'Quando a barbearia deu ciencia do cancelamento do cliente. Nulo = ainda no aviso da Agenda.';

-- ---------------------------------------------------------------------------
-- O gatilho passa a carimbar TAMBÉM quem cancelou
-- ---------------------------------------------------------------------------
create or replace function public.carimba_cancelamento()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'cancelado' and (old.status is distinct from 'cancelado') then
    new.cancelado_em := now();
    -- `is null` e não sobrescrever: quem sabe quem é (o cron) já disse, e a
    -- inferência não pode passar por cima de uma afirmação.
    if new.cancelado_por is null then
      new.cancelado_por := case when auth.uid() is null then 'cliente' else 'barbearia' end;
    end if;
  elsif new.status is distinct from 'cancelado' then
    -- Ressuscitou (o barbeiro desfez o cancelamento): some o carimbo inteiro,
    -- senão o horário volta para a agenda E continua no aviso de cancelados.
    new.cancelado_em := null;
    new.cancelado_por := null;
    new.cancelamento_visto_em := null;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O cron de reativação diz quem é, para não ser confundido com o cliente
-- ---------------------------------------------------------------------------
-- Reproduzida por inteiro porque é plpgsql; as únicas mudanças são os dois
-- `cancelado_por = 'sistema'`.
create or replace function public.expira_reativacoes_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total integer;
  v_soltas integer;
begin
  with expiradas as (
    update public.appointments a
       set status = 'cancelado', cancelado_por = 'sistema'
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

  update public.appointments a
     set status = 'cancelado', cancelado_por = 'sistema'
   where a.origem = 'reativacao'
     and a.status = 'agendado'
     and not a.confirmacao_enviada
     and a.data_hora_inicio < now() + interval '2 hours';
  get diagnostics v_soltas = row_count;

  return v_total + v_soltas;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O que a Agenda mostra
-- ---------------------------------------------------------------------------
-- `security_invoker` porque é a catraca do projeto desde a 0157: view sem ele
-- roda com os poderes de quem a criou e passa por cima do RLS — aqui isso
-- mostraria o cancelamento de uma barbearia para o dono de outra.
--
-- SETE DIAS, e não "tudo": aviso que acumula para sempre vira lista que
-- ninguém lê. Uma semana cobre quem só abre o CRM na segunda.
drop view if exists public.cancelamentos_a_avisar;
create view public.cancelamentos_a_avisar
with (security_invoker = on) as
select a.id,
       a.salon_id,
       a.data_hora_inicio,
       a.cancelado_em,
       c.nome as cliente,
       c.telefone as cliente_telefone,
       p.nome as barbeiro,
       (select string_agg(s.nome, ' + ' order by asv.ordem)
          from public.appointment_services asv
          join public.services s on s.id = asv.service_id
         where asv.appointment_id = a.id) as servicos,
       a.data_hora_inicio > now() as ainda_da_para_encaixar
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.professionals p on p.id = a.professional_id
 where a.status = 'cancelado'
   and a.cancelado_por = 'cliente'
   and a.cancelamento_visto_em is null
   and a.cancelado_em >= now() - interval '7 days';

comment on view public.cancelamentos_a_avisar is
  'Cancelamentos feitos pelo CLIENTE que a barbearia ainda nao viu, dos ultimos 7 dias. Alimenta o aviso da Agenda (etapa 6 do QR v2). O CRM da ciencia gravando cancelamento_visto_em.';

grant select on public.cancelamentos_a_avisar to authenticated;
