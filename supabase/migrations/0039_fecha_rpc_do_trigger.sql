-- `calcula_fim_do_agendamento` é função de TRIGGER, mas o Postgres a expõe em
-- `/rest/v1/rpc/` e ela nascia executável por `anon` e `authenticated` — e como
-- SECURITY DEFINER, rodando com os direitos do dono. Não há uso legítimo em
-- chamá-la direto; quem deve dispará-la é o trigger.
--
-- Apontado pelo advisor de segurança na auditoria de 2026-08-05, um dia depois
-- de a função ser criada na `0035`.
--
-- O trigger não depende deste grant: ele roda no contexto da tabela. Conferido
-- com insert dentro de transação — o fim continua sendo calculado.
--
-- Regra para as próximas: **toda função SECURITY DEFINER nasce pública na API.**
-- Ou revoga o EXECUTE, ou usa SECURITY INVOKER.

revoke execute on function public.calcula_fim_do_agendamento() from public, anon, authenticated;
revoke execute on function public.marca_updated_at() from public, anon, authenticated;
