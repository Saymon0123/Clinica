-- Toda tabela do schema public tem RLS habilitado.
--
-- O README afirma isso em letras garrafais, e afirmação sobre o banco que nada
-- verifica é a próxima mentira do README -- foi exatamente assim que ele passou
-- meses dizendo "as 21 tabelas têm RLS" enquanto elas já eram 47 (achado M13).
-- Esta catraca troca a contagem, que envelhece sozinha, por um invariante, que
-- só muda se alguém o quebrar.
--
-- O perigo concreto: tabela nova nasce SEM row level security. Se ela receber
-- os grants de sempre, `anon` e `authenticated` leem tudo, de todas as
-- barbearias, no mesmo instante em que a migration é aplicada. Nenhuma tela
-- quebra, nenhum erro aparece -- o vazamento é silencioso por construção.
--
-- Repare no que este teste NÃO exige: política. Treze tabelas têm RLS ligado e
-- zero políticas de propósito (`controle_de_taxa`, `mensagens_recebidas`,
-- `consumo_ia`, `entregas_falhadas`, `whatsapp_templates`...). Nelas, RLS sem
-- política significa "ninguém logado entra, só o service_role" -- que é o
-- desenho certo para tabela de infraestrutura. Exigir política aqui obrigaria
-- a escrever política de mentira, que é pior que nenhuma.
--
-- Rodar com: supabase test db

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

begin;
select plan(2);

-- A mensagem devolve o NOME da tabela culpada, e não só "falhou": o CI é lido
-- às pressas, e um nome economiza a caçada.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not c.relrowsecurity),
  '{}'::text[],
  'toda tabela do schema public tem RLS habilitado');

-- A trava do outro lado: RLS ligado não serve de nada se a tabela for FORÇADA a
-- ignorá-lo para o dono. Aqui isso nunca foi usado, e é bom que continue assim:
-- `force row level security` desligado mantém o dono do banco por fora, que é o
-- esperado, mas ligá-lo sem pensar muda o comportamento de toda função
-- `security definer` do projeto de uma vez.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relforcerowsecurity),
  '{}'::text[],
  'nenhuma tabela liga force row level security sem que alguem tenha decidido isso');

select * from finish();
rollback;
