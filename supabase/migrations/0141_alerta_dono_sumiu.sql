-- 0141: alerta "dono sumiu" -- fecha a lacuna do agente-mudo (0140).
--
-- O alerta de agente-mudo (auditoria_atendimento) ignora de proposito as
-- conversas com agent_paused=true, porque ali "o dono assumiu". Mas se o dono
-- assumiu e esqueceu, o cliente fica esperando e ninguem e avisado. Este ramo
-- fecha essa metade: mesma deteccao, so que para o humano -- com folga maior
-- (60 min em vez de 15, o dono pode estar com alguem na cadeira) e gravidade
-- menor (aviso: ele ja sabe da conversa, e so um cutucao).

create or replace view public.auditoria_atendimento
with (security_invoker = on) as
-- Agente mudo: o agente deveria ter respondido e nao respondeu.
select 'agente-mudo:' || ult.msg_id as chave,
       'Cliente sem resposta do agente' as tipo,
       'grave' as gravidade,
       c.salon_id,
       ult.created_at as ocorrido_em,
       s.nome || ' -- o cliente ' || coalesce(nullif(c.contact_name, ''), c.contact_phone)
         || ' escreveu ha ' || floor(extract(epoch from (now() - ult.created_at)) / 60)::int
         || ' min e ninguem respondeu. Ultima: "'
         || left(coalesce(nullif(c.last_message_preview, ''), ult.content), 120) || '".' as detalhe
  from public.whatsapp_conversations c
  join public.salons s on s.id = c.salon_id
  join lateral (
    select m.id as msg_id, m.direction, m.created_at, m.content
      from public.whatsapp_messages m
     where m.conversation_id = c.id
     order by m.created_at desc
     limit 1
  ) ult on true
 where ult.direction = 'in'
   and ult.created_at < now() - interval '15 minutes'
   and ult.created_at > now() - interval '24 hours'
   and not c.agent_paused
   and exists (select 1 from public.salons_atendendo sa where sa.id = c.salon_id)
union all
-- Dono sumiu: assumiu a conversa (agent_paused) e nao respondeu ha > 60 min.
select 'dono-sumiu:' || ult.msg_id as chave,
       'Dono assumiu a conversa e sumiu' as tipo,
       'aviso' as gravidade,
       c.salon_id,
       ult.created_at as ocorrido_em,
       s.nome || ' -- o dono assumiu a conversa com ' || coalesce(nullif(c.contact_name, ''), c.contact_phone)
         || ' e nao respondeu ha ' || floor(extract(epoch from (now() - ult.created_at)) / 60)::int
         || ' min. O agente esta pausado nessa conversa. Ultima: "'
         || left(coalesce(nullif(c.last_message_preview, ''), ult.content), 120) || '".' as detalhe
  from public.whatsapp_conversations c
  join public.salons s on s.id = c.salon_id
  join lateral (
    select m.id as msg_id, m.direction, m.created_at, m.content
      from public.whatsapp_messages m
     where m.conversation_id = c.id
     order by m.created_at desc
     limit 1
  ) ult on true
 where ult.direction = 'in'
   and ult.created_at < now() - interval '60 minutes'
   and ult.created_at > now() - interval '24 hours'
   and c.agent_paused
   and exists (select 1 from public.salons_atendendo sa where sa.id = c.salon_id);

comment on view public.auditoria_atendimento is
  'Alertas de atendimento: (grave) agente-mudo -- ultima msg do cliente sem resposta > 15 min com agente ativo; (aviso) dono-sumiu -- mesma coisa com agent_paused (dono assumiu) e > 60 min.';
