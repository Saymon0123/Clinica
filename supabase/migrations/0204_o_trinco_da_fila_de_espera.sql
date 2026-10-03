-- O trinco da fila de espera.
--
-- A 0203 criou as duas tabelas e deu `grant select` para `authenticated` -- e eu
-- conferi o resultado por consulta depois de aplicar, como manda a casa. O que
-- apareceu:
--
--     fila_de_espera | authenticated: DELETE,INSERT,REFERENCES,SELECT,
--                      TRIGGER,TRUNCATE,UPDATE
--                    | anon:          DELETE,INSERT,REFERENCES,SELECT,
--                      TRIGGER,TRUNCATE,UPDATE
--
-- Tabela nova **ganha o grant do padrão de privilégios do schema**, exatamente
-- como a view recriada ganha o `select` de `anon` (a armadilha que o CLAUDE.md
-- descreve para views). O `grant select` que eu escrevi não era o único grant
-- que existia; era o único que eu tinha visto.
--
-- ## Não era buraco, e isso foi MEDIDO antes de eu dizer qualquer coisa
--
-- Com `set role anon`, dentro de uma transação desfeita, contra uma tabela que
-- tinha uma linha de verdade:
--
-- - leu **0 linhas** — a policy de `select` filtra por `private.salon_ids()`,
--   que para `anon` não devolve nada;
-- - `insert` **recusado** — RLS ligada e nenhuma policy de escrita;
-- - `delete` pegou **0 linhas**.
--
-- A RLS segurou. É o mesmo desenho do `whatsapp_templates`, que em 01/10 eu
-- quase reportei como falha e não era.
--
-- ## Mas o trinco se aperta de qualquer jeito
--
-- Privilégio solto não é inofensivo por sorte. O dia em que alguém precisar de
-- uma policy de INSERT para um caso estreito, o `anon` vai de carona e ninguém
-- vai olhar o grant, porque "a tabela sempre funcionou". Privilégio que bate com
-- a intenção é o que faz a próxima leitura dizer a verdade.
--
-- Escrita continua sendo só pelas RPCs `entrar_na_fila` e `sair_da_fila`, que são
-- `definer` e validam o resto.

revoke all on public.fila_de_espera from anon, authenticated;
revoke all on public.fila_de_espera_servicos from anon, authenticated;

grant select on public.fila_de_espera to authenticated;
grant select on public.fila_de_espera_servicos to authenticated;

notify pgrst, 'reload schema';
