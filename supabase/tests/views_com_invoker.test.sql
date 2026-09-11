-- Toda view do schema public roda com as permissões de quem consulta
-- (revisão de segurança de 11/09, migration 0157).
--
-- Duas vezes esta propriedade se perdeu num `create or replace view` sem o
-- `with (security_invoker = on)`: nas três views de cobrança (A2, 0144) e na
-- `auditoria_pendente` (0152). O replace não carrega as opções da versão
-- anterior, e nada avisava — a view seguia funcionando, só que com as
-- permissões do dono do banco, por cima da RLS. Esta catraca avisa: view nova
-- ou recriada sem invoker deixa o CI vermelho, com o nome dela na mensagem.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(2);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'v'
      and not coalesce(c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true'], false)),
  '{}'::text[],
  'nenhuma view do schema public roda com as permissoes do dono do banco');

select is(
  has_table_privilege('anon', 'public.auditoria_pendente', 'SELECT'),
  false,
  'o site sem login nao tem permissao na fila de auditoria');

select * from finish();
rollback;
