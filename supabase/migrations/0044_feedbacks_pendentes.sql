-- O fluxo do n8n precisa dos feedbacks ainda não avisados. Fazer isso com o
-- filtro `notificado_em is null` no nó Supabase é convidar o mesmo defeito que
-- derrubou o fluxo de lembretes por semanas: aquele nó manda a string literal
-- `"null"` para o PostgREST, que tenta converter e devolve 400.
--
-- A view resolve na origem: o fluxo faz um getAll sem filtro nenhum e recebe
-- exatamente o que falta avisar. Um lugar a menos onde errar.

create or replace view public.feedbacks_pendentes
with (security_invoker = on) as
select f.id, f.salon_id, f.user_id, f.tipo, f.mensagem, f.rota, f.created_at
from public.feedbacks f
where f.notificado_em is null;

comment on view public.feedbacks_pendentes is
  'Feedbacks que ainda nao foram avisados ao dono do produto. Consumida pelo n8n; evita o filtro is-null no no Supabase, que envia a string "null" e quebra.';

revoke all on public.feedbacks_pendentes from anon, authenticated;
grant select on public.feedbacks_pendentes to service_role;
