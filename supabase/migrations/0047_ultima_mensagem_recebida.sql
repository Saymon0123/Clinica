-- O cliente manda em rajada: "Ola", "queria marcar um corte", "tem horario
-- amanha?". Cada mensagem chega no webhook e dispara uma execucao, entao o
-- agente respondia tres vezes -- e em 2026-08-06, as 00:28, perguntou o nome do
-- cliente nas tres, porque nenhuma execucao sabia das outras.
--
-- A correcao e uma espera curta antes de responder. Passada a espera, o fluxo
-- pergunta: ainda sou eu a ultima mensagem desta conversa? Se chegou coisa mais
-- nova, esta execucao desiste em silencio -- a execucao da mensagem mais nova
-- vai responder, e o historico dela ja contem TODAS. O cliente recebe uma
-- resposta so, com o pedido inteiro entendido.
--
-- A view existe porque o no Supabase do n8n nao ordena resultado. Fazer isso
-- com filtro e ordenacao no fluxo seria fragil; aqui o `distinct on` resolve na
-- origem e o fluxo so compara dois ids.

create or replace view public.ultima_mensagem_recebida
with (security_invoker = on) as
select distinct on (m.conversation_id)
  m.conversation_id,
  m.id as message_id,
  m.created_at
from public.whatsapp_messages m
where m.direction = 'in'
order by m.conversation_id, m.created_at desc;

comment on view public.ultima_mensagem_recebida is
  'Ultima mensagem recebida de cada conversa. Usada pelo agente para saber se ainda e a vez dele responder depois da espera.';

revoke all on public.ultima_mensagem_recebida from anon, authenticated;
grant select on public.ultima_mensagem_recebida to service_role;
