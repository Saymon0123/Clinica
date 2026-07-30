-- Permissões de tabela para os papéis do Supabase.
--
-- Produção tem GRANT completo para `anon`, `authenticated` e `service_role` em
-- todas as tabelas de `public` — é o padrão que o Supabase aplica ao projeto.
-- Essas permissões nunca entraram nas migrations, então um banco criado só a
-- partir do repositório (dev local, `supabase db start`, o job de pgTAP no CI)
-- nascia sem elas.
--
-- O sintoma é enganoso: em vez de "zero linhas" pelo RLS, o Postgres devolve
-- `permission denied for table clients`. Foi exatamente onde os testes de
-- isolamento pararam no CI em 2026-07-30 — o teste estava certo, o schema é que
-- não reproduzia produção.
--
-- Não afrouxa nada: GRANT é a porta de fora, o RLS é a de dentro. Toda tabela
-- aqui tem RLS habilitado com política, e é ele que decide o que cada usuário
-- enxerga. Sem o GRANT, nem o dono legítimo consegue ler a própria linha.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Sem isto, cada tabela nova criada daqui pra frente repetiria o problema.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
