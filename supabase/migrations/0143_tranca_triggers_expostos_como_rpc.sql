-- 0143: tranca os dois triggers que estavam executaveis como RPC.
-- (Advisors 0028/0029: SECURITY DEFINER executavel por anon/authenticated.)
--
-- `marca_o_fim_do_teste` e `respeita_folga_entre_atendimentos` sao funcoes de
-- TRIGGER (RETURNS trigger), nao RPCs. Ficaram com EXECUTE para `public`
-- (herdado na criacao), o que as deixou chamaveis por `anon` e `authenticated`
-- via `/rest/v1/rpc/`. Nenhum codigo do CRM as chama -- elas sao invocadas pelo
-- proprio mecanismo de trigger, que roda com o privilegio do dono da tabela e
-- NAO checa EXECUTE do usuario. Revogar EXECUTE fecha a superficie exposta sem
-- afetar os triggers em nada.

revoke execute on function public.marca_o_fim_do_teste() from public, anon, authenticated;
revoke execute on function public.respeita_folga_entre_atendimentos() from public, anon, authenticated;
