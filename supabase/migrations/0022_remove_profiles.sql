-- Remove a tabela `profiles`.
--
-- Era a fonte de verdade antiga do vínculo usuário→salão, substituída por
-- `user_salons` — a mesma tabela que as políticas de RLS consultam. Ela ficou
-- sendo escrita por accept-invite e admin-create-salon, mas nenhum leitor
-- sobrou depois que a função `whatsapp` passou a ler user_salons.
--
-- Manter duas fontes já causou dois bugs nesta base: barbeiro sem acesso ao
-- próprio perfil, e a tela de Conexão devolvendo 404. Vale mais apagar do que
-- deixar uma tabela que volta a sair de sincronia no primeiro descuido.

drop table if exists profiles;
