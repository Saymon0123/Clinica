-- HOTFIX de seguranca (2026-08-25, achado do giro completo).
--
-- A 0098 refez `salons_com_automacao` com `create or replace view` SEM repetir
-- `with (security_invoker = on)` -- e o Postgres reseta as reloptions no
-- replace. Resultado: a view voltou a rodar como o dono (postgres), ignorando
-- o RLS, e o grant a authenticated (0032) deixava QUALQUER usuario logado ler
-- id, nome e situacao de assinatura de TODAS as barbearias.
--
-- Regra que fica: todo `create or replace view` REPETE a clausula `with`.
-- (drop + create ja obriga; o replace e a pegadinha.)

alter view public.salons_com_automacao set (security_invoker = on);
