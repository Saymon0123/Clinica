-- 0145 — Fecha o buraco que a 0144 abriu nas views de cobranca.
--
-- Sem `security_invoker`, uma view roda com os privilegios do DONO (postgres) e
-- IGNORA a RLS das tabelas base. As tres views recriadas pela 0144 sairam sem a
-- opcao; as outras 39 do banco tem. Provado antes de corrigir, com um par de
-- views descartaveis criadas e destruidas na mesma transacao: como
-- `authenticated`, a view SEM invoker devolveu 1 linha; a COM invoker, 0; a
-- tabela base, 0.
--
-- `auditoria_cobranca` esta concedida a `authenticated` -> era vazamento entre
-- barbearias de verdade (0 linhas hoje so porque o banco esta vazio). As outras
-- duas herdaram grants automaticos de `anon`/`authenticated` (default privileges
-- do Supabase) e estavam barradas por acaso, porque nenhum dos dois tem EXECUTE
-- em `email_do_dono`. Acaso nao e controle de acesso: o grant sai.
--
-- Sao filas de servico. Quem le e o n8n, com a service key, e a service_role
-- ignora RLS de qualquer jeito -- nada quebra.

alter view public.auditoria_cobranca  set (security_invoker = on);
alter view public.faturas_a_notificar set (security_invoker = on);
alter view public.cobrancas_a_enviar  set (security_invoker = on);

revoke all on public.faturas_a_notificar from anon, authenticated;
revoke all on public.cobrancas_a_enviar  from anon, authenticated;

grant select on public.faturas_a_notificar to service_role;
grant select on public.cobrancas_a_enviar  to service_role;
