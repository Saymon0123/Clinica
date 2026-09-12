-- 0162: a mensagem do cliente não se perde (Fase 5 — achado A3).
--
-- O BURACO. O `whatsapp-webhook` não gravava a mensagem recebida em lugar
-- nenhum — zero escritas de `whatsapp_messages` no arquivo. Ele autentica,
-- descobre de quem é e faz `POST` para o n8n; quem grava o histórico da conversa
-- é o n8n, depois. Desde a Fase 1 ele **confere** o `.ok` e avisa o Sentry
-- quando o n8n recusa (isso era o A10). Mas conferir não é guardar: com o n8n
-- fora do ar, com 500 ou lento demais, **o cliente escreveu e ninguém nunca vai
-- saber o que ele escreveu**. Ele fica esperando uma resposta que não vem.
--
-- E a Meta não salva: nós respondemos 200 SEMPRE, de propósito, porque falha
-- repetida faz ela desativar o webhook do aplicativo inteiro — uma barbearia
-- com problema calaria todas as outras. Some disso que a única retentativa
-- possível é a nossa, e ela não existia.
--
-- A FILA, no padrão da 0104. Coluna de data como marca: `entregue_em` nulo quer
-- dizer "ainda não saiu". Gravar vem ANTES do envio, marcar vem DEPOIS — então
-- falha de entrega deixa a linha na fila em vez de perdê-la.
--
-- POR QUE O PAYLOAD INTEIRO. A linha guarda o JSON exato que a edge manda ao
-- agente, e não campo a campo. Duas razões: quem reentrega devolve o mesmo
-- corpo, sem remontar nada do outro lado; e se o formato mudar amanhã, a
-- mensagem de ontem ainda sai do jeito que o agente daquele dia esperava.
--
-- A CHAVE É O `message_id` DA META. Isso dá idempotência de graça: quando a
-- Meta reentrega o mesmo evento — e ela reentrega —, o insert não duplica e a
-- edge sabe que já tratou aquilo, em vez de o agente responder duas vezes à
-- mesma frase.
--
-- 24 HORAS, E NÃO MAIS. Fora da janela de 24h da Meta não dá para responder
-- texto livre, só modelo aprovado. Reentregar depois disso faria o agente
-- escrever uma resposta que a Meta recusa — barulho, não conserto.
--
-- O QUE FICA PARA DEPOIS, dito com todas as letras: esta é a fila de ENTRADA.
-- A fila de SAÍDA — a resposta que o `entregarAoN8n` manda ao n8n e que também
-- pode se perder — continua sem retentativa. O comentário daquela função já
-- prometia as duas; esta migration entrega uma.

create table if not exists public.mensagens_recebidas (
  -- O wamid da Meta. Chave primária de propósito: é o que deduplica a
  -- reentrega dela sem nenhuma trava extra.
  message_id text primary key,
  salon_id uuid references public.salons(id) on delete cascade,
  phone_number_id text not null,
  contact_phone text not null,
  contact_name text,
  tipo text,
  -- O corpo exato que vai para o agente. Quem reentrega faz POST disto.
  payload jsonb not null,
  recebida_em timestamptz not null default now(),
  entregue_em timestamptz,
  tentativas integer not null default 0,
  ultimo_erro text
);

comment on table public.mensagens_recebidas is
  'Toda mensagem de cliente que entrou pelo webhook da Meta, gravada ANTES de ser entregue ao agente. `entregue_em` nulo = ainda na fila. Existe para que n8n fora do ar nao signifique mensagem perdida (0162, A3).';

comment on column public.mensagens_recebidas.payload is
  'O JSON exato que a edge manda ao agente. Guardado inteiro para a reentrega devolver o mesmo corpo, e para mensagem antiga continuar saindo no formato que o agente daquele dia esperava.';

alter table public.mensagens_recebidas enable row level security;

comment on column public.mensagens_recebidas.entregue_em is
  'Quando o agente confirmou o recebimento. Nulo = na fila. RLS sem policy: so service_role (n8n) e as funcoes definer.';

-- A fila é varrida por data e a coluna é quase toda nula: índice parcial, que é
-- pequeno e serve exatamente à pergunta que a view faz.
create index if not exists idx_mensagens_na_fila
  on public.mensagens_recebidas (recebida_em)
  where entregue_em is null;

-- ---------------------------------------------------------------------------
-- Gravar antes de entregar
-- ---------------------------------------------------------------------------
-- Devolve `true` quando a mensagem é nova. `false` quer dizer que já
-- conhecíamos este `message_id`, e aí a edge NÃO entrega de novo: é reentrega da
-- Meta, e o agente já viu (ou a fila vai levar).
create or replace function public.registrar_mensagem_recebida(
  p_message_id text,
  p_salon_id uuid,
  p_phone_number_id text,
  p_contact_phone text,
  p_contact_name text,
  p_tipo text,
  p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nova boolean;
begin
  insert into public.mensagens_recebidas
    (message_id, salon_id, phone_number_id, contact_phone, contact_name, tipo, payload)
  values
    (p_message_id, p_salon_id, p_phone_number_id, p_contact_phone, p_contact_name, p_tipo, p_payload)
  on conflict (message_id) do nothing;
  get diagnostics v_nova = row_count;
  return v_nova;
end;
$$;

revoke all on function public.registrar_mensagem_recebida(text, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;

comment on function public.registrar_mensagem_recebida(text, uuid, text, text, text, text, jsonb) is
  'Grava a mensagem recebida antes de entregar ao agente. Devolve true se e nova; false quando o message_id ja existia, que e a reentrega da Meta e nao deve virar segunda resposta do agente.';

-- ---------------------------------------------------------------------------
-- Marcar o desfecho
-- ---------------------------------------------------------------------------
create or replace function public.marcar_mensagem_entregue(p_message_id text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.mensagens_recebidas
     set entregue_em = now(), ultimo_erro = null
   where message_id = p_message_id and entregue_em is null;
$$;

revoke all on function public.marcar_mensagem_entregue(text) from public, anon, authenticated;

create or replace function public.marcar_tentativa_de_entrega(p_message_id text, p_erro text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.mensagens_recebidas
     set tentativas = tentativas + 1,
         ultimo_erro = left(coalesce(p_erro, 'sem detalhe'), 500)
   where message_id = p_message_id and entregue_em is null;
$$;

revoke all on function public.marcar_tentativa_de_entrega(text, text) from public, anon, authenticated;

comment on function public.marcar_tentativa_de_entrega(text, text) is
  'Conta mais uma tentativa falha de entrega ao agente e guarda o erro. Cinco tentativas tiram a linha da fila -- payload que o agente recusa por defeito proprio nao pode girar para sempre.';

-- ---------------------------------------------------------------------------
-- A fila
-- ---------------------------------------------------------------------------
-- Cinco tentativas: passou disso, o problema não é intermitência, é a mensagem
-- em si. Ela para de ser reentregue e fica na tabela para alguém olhar.
create or replace view public.mensagens_a_entregar
with (security_invoker = on) as
select m.message_id,
       m.salon_id,
       s.nome as barbearia,
       m.contact_phone,
       m.tipo,
       m.payload,
       m.recebida_em,
       m.tentativas,
       m.ultimo_erro
  from public.mensagens_recebidas m
  join public.salons s on s.id = m.salon_id
 where m.entregue_em is null
   and m.tentativas < 5
   and m.recebida_em > now() - interval '24 hours'
 order by m.recebida_em;

comment on view public.mensagens_a_entregar is
  'Fila de reentrega das mensagens que nao chegaram ao agente. Dentro da janela de 24h da Meta, porque fora dela nao da para responder texto livre. Ate 5 tentativas.';

revoke all on public.mensagens_a_entregar from anon, authenticated;
grant select on public.mensagens_a_entregar to service_role;

-- ---------------------------------------------------------------------------
-- O aviso, no canal que já existe
-- ---------------------------------------------------------------------------
-- Mensagem parada na fila há mais de 15 minutos quer dizer que o agente está
-- mudo para aquela barbearia AGORA, com cliente esperando do outro lado.
--
-- View nova, e não mais um bloco dentro de `auditoria_operacao`: aquela tem seis
-- uniões e ~120 linhas, e reescrevê-la inteira só para acrescentar um caso é
-- exatamente o tipo de transcrição que já custou o `security_invoker` da
-- `auditoria_pendente` na 0152. Uma view pequena, unida no fim, é menos código
-- para errar e mais fácil de apagar se a ideia não servir.
create or replace view public.auditoria_mensagens
with (security_invoker = on) as
select 'mensagem-parada:' || m.message_id as chave,
       'Mensagem de cliente nao chegou ao agente'::text as tipo,
       'grave'::text as gravidade,
       m.salon_id,
       m.recebida_em as ocorrido_em,
       s.nome || ' -- mensagem de ' || m.contact_phone || ' recebida ha '
         || floor(extract(epoch from now() - m.recebida_em) / 60)::integer
         || ' minutos e ainda nao chegou ao agente (' || m.tentativas
         || ' tentativas). O cliente esta esperando resposta.' as detalhe
  from public.mensagens_recebidas m
  join public.salons s on s.id = m.salon_id
 where m.entregue_em is null
   and m.recebida_em < now() - interval '15 minutes'
   and m.recebida_em > now() - interval '24 hours';

comment on view public.auditoria_mensagens is
  'Alerta de mensagem de cliente parada na fila de entrada ha mais de 15 minutos: o agente esta mudo para aquela barbearia e alguem esta esperando resposta. 0162, A3.';

revoke all on public.auditoria_mensagens from anon, authenticated;

-- A união ganha o nono membro. REPLACE com `security_invoker` escrito: ele NÃO
-- é herdado da versão anterior, e foi assim que a 0152 o perdeu aqui mesmo.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_do_agente
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_fronteira
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_operacao
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_avaliacao
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_atendimento
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_cobranca
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_comanda
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_entrega
union all
select chave, tipo, gravidade, salon_id, ocorrido_em, detalhe from public.auditoria_mensagens;

revoke all on public.auditoria_pendente from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retenção
-- ---------------------------------------------------------------------------
-- 90 dias, como a `entregas_falhadas`: isto é livro de entrega, não histórico de
-- conversa. O histórico mora em `whatsapp_messages`, que guarda 12 meses. O
-- resto da função é o que já estava lá, linha por linha.
create or replace function public.poda_historico_antigo()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_total integer := 0; v_qtd integer;
begin
  delete from public.whatsapp_messages where created_at < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.auditoria_avisos where avisado_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.cobranca_eventos where recebido_em < now() - interval '12 months';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.controle_de_taxa where janela_inicio < now() - interval '7 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.salon_invites
   where usado_em is null and expira_em is not null and expira_em < now() - interval '30 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.entregas_falhadas where ocorrido_em < now() - interval '90 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  delete from public.mensagens_recebidas where recebida_em < now() - interval '90 days';
  get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
  return v_total;
end;
$function$;
