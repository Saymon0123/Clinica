-- Remove `profiles`, que só existe no repositório.
--
-- A tabela é criada em `0002_profiles_and_rls.sql`, mas foi removida de produção
-- pela migration `remove_profiles` (2026-07-27) — feita direto no banco e nunca
-- trazida para cá. Resultado: um banco construído a partir do repositório nascia
-- com uma tabela e uma função que produção não tem.
--
-- A fonte de verdade dos vínculos usuário↔salão é `user_salons` (criada na
-- `0014`), e o próprio comentário da edge function `whatsapp` já registra que
-- "profiles é legado e sai de sincronia".
--
-- `auth_salon_id()` vem junto: era usada pelas políticas da `0002` e `0003`, que
-- a `0015` substituiu pelas funções do schema `private`. Depois da `0015`
-- nenhuma política a referencia.
--
-- Idempotente de propósito: em produção é no-op, num banco limpo faz a limpeza.

drop table if exists public.profiles cascade;
drop function if exists public.auth_salon_id() cascade;
