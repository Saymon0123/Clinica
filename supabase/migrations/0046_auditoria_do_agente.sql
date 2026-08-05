-- Auditoria: alguém precisa ler o que o agente faz.
--
-- Em 2026-08-05 nove defeitos foram encontrados **no olho**, lendo conversa por
-- conversa. Isso não escala e não sobrevive a mais de uma barbearia. As regras
-- abaixo não são hipóteses: cada uma corresponde a um defeito que aconteceu.
--
-- Elas vivem em SQL porque é onde está a verdade — a mensagem que saiu e o que
-- existe no banco, lado a lado. Um verificador escrito no n8n precisaria buscar
-- os dois e comparar em JavaScript, e erraria como o modelo erra.
--
-- Cada achado tem uma `chave` estável. É ela que permite avisar uma vez só, com
-- a mesma trava de idempotência de `asaas_eventos`: o aviso grava a chave, e o
-- que já tem chave gravada não volta.
--
-- Janela de 7 dias: auditoria é para agir agora. Histórico velho vira ruído e
-- deixa o relatório longo demais para alguém ler.

create table if not exists public.auditoria_avisos (
  chave text primary key,
  avisado_em timestamptz not null default now()
);

comment on table public.auditoria_avisos is
  'Achados de auditoria ja comunicados. Serve so para nao repetir o mesmo aviso.';

create or replace view public.auditoria_do_agente
with (security_invoker = on) as

-- 1. Prometeu agendamento e não criou.
--
-- O pior defeito possível: o cliente aparece na barbearia e não há nada na
-- agenda. Aconteceu quatro vezes em 2026-08-05 antes de ser corrigido.
select
  'agendamento-prometido:' || m.id as chave,
  'Prometeu agendar e nao criou' as tipo,
  'grave' as gravidade,
  c.salon_id,
  m.created_at as ocorrido_em,
  'Mensagem: "' || left(m.content, 160) || '"' as detalhe
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and m.content ~* '(agendad|marcad|confirmad|garantid|reservad)'
  and m.content !~* '(cancel|desmarc)'
  and not exists (
    select 1
    from public.appointments a
    join public.clients cl on cl.id = a.client_id
    where a.salon_id = c.salon_id
      and cl.telefone_norm = right(regexp_replace(c.contact_phone, '\D', '', 'g'), 8)
      and a.created_at between m.created_at - interval '3 minutes'
                          and m.created_at + interval '1 minute'
  )

union all

-- 2. Disse que cancelou e não cancelou.
select
  'cancelamento-prometido:' || m.id,
  'Disse que cancelou e nao cancelou',
  'grave',
  c.salon_id,
  m.created_at,
  'Mensagem: "' || left(m.content, 160) || '"'
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and m.content ~* '(cancelei|cancelado|desmarquei|desmarcado)'
  and not exists (
    select 1
    from public.appointments a
    join public.clients cl on cl.id = a.client_id
    where a.salon_id = c.salon_id
      and cl.telefone_norm = right(regexp_replace(c.contact_phone, '\D', '', 'g'), 8)
      and a.status = 'cancelado'
      and a.updated_at between m.created_at - interval '3 minutes'
                          and m.created_at + interval '1 minute'
  )

union all

-- 3. Agendamento fora da jornada do barbeiro.
--
-- Pega o caso do Rafael marcado às 12:00 num dia em que ele entra às 13:00.
-- Só acusa quando o barbeiro TEM jornada cadastrada: sem jornada, não há regra
-- para violar — esse caso é o item 5.
select
  'fora-da-jornada:' || a.id,
  'Agendamento fora do horario do barbeiro',
  'grave',
  a.salon_id,
  a.created_at,
  p.nome || ' em ' || to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
from public.appointments a
join public.professionals p on p.id = a.professional_id
where a.status <> 'cancelado'
  and a.data_hora_inicio > now()
  and exists (select 1 from public.professional_schedules s where s.professional_id = a.professional_id and s.ativo)
  and not exists (
    select 1 from public.professional_schedules ps
    where ps.professional_id = a.professional_id
      and ps.ativo
      and ps.dia_semana = extract(dow from a.data_hora_inicio at time zone 'America/Sao_Paulo')
      and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::time >= ps.hora_inicio
      and (a.data_hora_fim   at time zone 'America/Sao_Paulo')::time <= ps.hora_fim
  )

union all

-- 4. Texto que não deveria chegar ao cliente.
--
-- Markdown não renderiza no WhatsApp e aparece como asterisco solto; linguagem
-- de sistema ("cadastrado com sucesso", "houve um problema") entrega que existe
-- um robô e não ajuda ninguem. As duas coisas já foram corrigidas na origem —
-- se voltarem, a correção furou em algum caminho novo.
select
  'texto-ruim:' || m.id,
  'Texto impróprio na mensagem',
  'leve',
  c.salon_id,
  m.created_at,
  'Mensagem: "' || left(m.content, 160) || '"'
from public.whatsapp_messages m
join public.whatsapp_conversations c on c.id = m.conversation_id
where m.direction = 'out' and m.sender = 'agente'
  and m.created_at > now() - interval '7 days'
  and (
    m.content like '%**%'
    or m.content ~* '(cadastrado com sucesso|houve um problema|nao foi possivel concluir|erro ao)'
  )

union all

-- 5. Barbearia configurada pela metade.
--
-- Sem jornada o agente não sabe quando oferecer; sem assinatura ela fica fora
-- das automações. Nos dois casos o dono não recebe erro nenhum — o sistema
-- simplesmente rende menos, em silêncio. Foi o estado em que a unidade São José
-- passou semanas.
select
  'barbearia-incompleta:' || s.id || ':' || to_char(current_date, 'YYYY-MM-DD'),
  'Barbearia configurada pela metade',
  'aviso',
  s.id,
  now(),
  s.nome || ' — ' ||
    concat_ws(' e ',
      case when not exists (
        select 1 from public.professional_schedules ps
        join public.professionals p on p.id = ps.professional_id
        where p.salon_id = s.id and p.ativo and ps.ativo
      ) then 'sem jornada cadastrada' end,
      case when not exists (
        select 1 from public.subscriptions sub where sub.salon_id = s.id
      ) then 'sem assinatura registrada' end
    )
from public.salons s
where s.ativo
  and (
    not exists (
      select 1 from public.professional_schedules ps
      join public.professionals p on p.id = ps.professional_id
      where p.salon_id = s.id and p.ativo and ps.ativo
    )
    or not exists (select 1 from public.subscriptions sub where sub.salon_id = s.id)
  );

comment on view public.auditoria_do_agente is
  'Achados de auditoria dos ultimos 7 dias. Cada regra corresponde a um defeito real observado, nao a uma hipotese.';

-- O que ainda não foi comunicado.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.*
from public.auditoria_do_agente a
left join public.auditoria_avisos av on av.chave = a.chave
where av.chave is null
order by
  case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
  a.ocorrido_em desc;

comment on view public.auditoria_pendente is
  'Achados ainda nao avisados, mais graves primeiro. Consumida pelo n8n.';

alter table public.auditoria_avisos enable row level security;
revoke all on public.auditoria_avisos from anon, authenticated;
revoke all on public.auditoria_do_agente from anon, authenticated;
revoke all on public.auditoria_pendente from anon, authenticated;
grant select on public.auditoria_do_agente, public.auditoria_pendente to service_role;
grant select, insert on public.auditoria_avisos to service_role;
