-- O agente ofereceu "Corte com máquina e tesoura", que não existe no catálogo.
--
-- A prevenção falhou duas vezes: primeiro com regra no prompt, depois pondo o
-- catálogo inteiro no contexto. Verifiquei na execução que o catálogo **chegou
-- completo** — e ele inventou mesmo assim. O problema não é falta de
-- informação, é parafrasear: na mesma mensagem ele também escreveu "Corte na
-- máquina", cortando o "(social)".
--
-- Quando a prevenção não é confiável, o mínimo é **saber que aconteceu**. Um
-- cliente pedindo serviço que a barbearia não faz é constrangimento na cadeira,
-- e hoje isso só apareceria se alguém lesse a conversa.
--
-- A regra quebra a mensagem em linhas e olha só as que parecem item de lista.
-- Uma linha vale se estiver contida num nome de serviço ou o contiver — assim
-- "Corte na máquina" passa (é o "(social)" abreviado, chato mas não inventado)
-- e "Corte com máquina e tesoura" é acusado.
--
-- Linhas com hora são ignoradas: são listagem de barbeiro ("Lucas: das 09:00 às
-- 20:00"), não de serviço. Sem esse filtro a regra acusava os dois barbeiros a
-- cada oferta de horário — e auditoria ruidosa é auditoria que ninguém lê.

create or replace view public.auditoria_servicos_inventados
with (security_invoker = on) as
with linhas as (
  select m.id as message_id, c.salon_id, m.created_at,
         btrim(regexp_replace(linha, '^[\s•\-\*]+|\*', '', 'g')) as item
  from public.whatsapp_messages m
  join public.whatsapp_conversations c on c.id = m.conversation_id
  cross join lateral regexp_split_to_table(m.content, E'\n') as linha
  where m.direction = 'out' and m.sender = 'agente'
    and m.created_at > now() - interval '7 days'
    and linha ~ '^\s*[•\-]\s*\*?[A-Za-zÀ-ú]'
)
select
  'servico-inventado:' || l.message_id || ':' || left(md5(l.item), 8) as chave,
  'Ofereceu servico que nao existe' as tipo,
  'grave' as gravidade,
  l.salon_id,
  l.created_at as ocorrido_em,
  'Citou "' || l.item || '", que nao esta no catalogo' as detalhe
from linhas l
where l.item !~ '\d{1,2}:\d{2}'
  and not exists (
    select 1 from public.services s
    where s.salon_id = l.salon_id and s.ativo
      and (lower(s.nome) like '%' || lower(l.item) || '%' or lower(l.item) like '%' || lower(s.nome) || '%')
  );

comment on view public.auditoria_servicos_inventados is
  'Linhas de lista em mensagens do agente que nao correspondem a nenhum servico do catalogo. Linhas com horario sao ignoradas: sao listagem de barbeiro.';

revoke all on public.auditoria_servicos_inventados from anon, authenticated;
grant select on public.auditoria_servicos_inventados to service_role;

-- Entra na fila que o n8n consome.
create or replace view public.auditoria_pendente
with (security_invoker = on) as
select a.* from (
  select * from public.auditoria_do_agente
  union all
  select * from public.auditoria_servicos_inventados
) a
left join public.auditoria_avisos av on av.chave = a.chave
where av.chave is null
order by
  case a.gravidade when 'grave' then 1 when 'aviso' then 2 else 3 end,
  a.ocorrido_em desc;
