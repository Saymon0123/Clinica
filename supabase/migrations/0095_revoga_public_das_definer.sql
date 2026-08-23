-- Fecha de verdade as funcoes SECURITY DEFINER.
--
-- **O erro:** `revoke ... from anon, authenticated` nao fecha nada, porque no
-- Postgres toda funcao nasce com EXECUTE concedido a PUBLIC -- e anon herda de
-- PUBLIC. As migrations 0084, 0086 e 0094 fizeram exatamente esse revoke e
-- acreditaram ter restringido; o advisor do Supabase mostrou as cinco funcoes
-- executaveis por anon via /rest/v1/rpc.
--
-- O que estava exposto ate aqui, sem login nenhum:
-- - `user_id_por_email`: oraculo de quais e-mails tem conta no produto;
-- - `responder_lembrete`: confirmar/cancelar agendamento de terceiro, se o
--   wamid fosse conhecido;
-- - `trocar_horarios`: trocar horarios de QUALQUER barbearia (roda como dono
--   da funcao, ignora RLS);
-- - `salon_por_phone_number_id` e `horarios_livres`: leitura, dano menor.
--
-- A regra daqui em diante: funcao definer sensivel revoga de PUBLIC, e so
-- entao concede a quem deve. service_role nao precisa de grant -- e superuser
-- de API e passa por cima.

revoke execute on function public.user_id_por_email(text) from public, anon, authenticated;
revoke execute on function public.responder_lembrete(text, text) from public, anon, authenticated;
revoke execute on function public.salon_por_phone_number_id(text) from public, anon, authenticated;
revoke execute on function public.trocar_horarios(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.horarios_livres(uuid, date, integer, uuid) from public, anon, authenticated;

-- Quem chama cada uma hoje, conferido no codigo:
-- - horarios_livres: edge function agenda-publica (service_role) e o agente no
--   n8n (service_role). Ninguem no front.
-- - trocar_horarios: so o proprio banco/n8n.
-- - as outras tres: so edge functions.
-- Se algum dia o front precisar, o grant e explicito e pontual -- nunca PUBLIC.
