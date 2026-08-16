-- `auth.uid()` direto na policy é reavaliado **linha a linha**.
--
-- Envolvido em `(select ...)`, o Postgres reconhece como constante da consulta
-- e chama uma vez só. É a recomendação do próprio linter do Supabase, e era o
-- único WARN de performance que este projeto criou — os outros 65 vêm de
-- políticas antigas, herdadas.
--
-- Sem efeito nesta escala: a tabela tem poucas linhas. Vira problema quando
-- houver um registro de aceite por cliente e alguém listar o histórico.
drop policy if exists "termos_aceites: titular le o proprio" on public.termos_aceites;

create policy "termos_aceites: titular le o proprio" on public.termos_aceites
  for select using (user_id = (select auth.uid()));
