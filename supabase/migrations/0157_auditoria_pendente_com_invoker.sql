-- 0157: a fila de auditoria volta a rodar com as permissões de quem consulta
-- (revisão de segurança de 11/09).
--
-- A 0152 recriou `auditoria_pendente` com `create or replace view ... as`, sem
-- repetir o `with (security_invoker = on)` — e o replace não carrega as opções
-- da versão anterior (a mesma armadilha que a 0131 anotou, e que já tinha
-- custado as três views de cobrança no A2). Ela virou a única das 43 views do
-- schema public a rodar com as permissões do dono do banco, ainda concedida ao
-- site sem login e a qualquer usuário logado.
--
-- NÃO VAZOU, e isso foi provado, não deduzido: em 11/09, com uma falha de
-- entrega de mentira dentro de um ensaio desfeito, a consulta sem login e a de
-- um usuário de outra barbearia foram barradas — as oito views de dentro rodam
-- com as permissões de quem consulta, e a de fora não passa por cima delas. Mas
-- era uma camada a menos: a próxima fila que entrasse na união sem invoker
-- vazaria para todo mundo. A catraca `views_com_invoker.test.sql` segura a
-- classe inteira daqui para a frente.
--
-- Quem lê esta view é o n8n (Auditoria do Agente), com a chave de serviço. A
-- equipe e o site sem login não têm por que ter permissão nela.
alter view public.auditoria_pendente set (security_invoker = on);

revoke all on public.auditoria_pendente from anon, authenticated;
