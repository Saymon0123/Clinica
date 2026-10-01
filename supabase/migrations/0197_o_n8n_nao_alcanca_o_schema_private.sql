-- O n8n não alcança o schema `private`.
--
-- As duas RPCs que eu criei para o n8n chamar nasceram em `private`:
-- `expirar_reservas` (0192) e `registrar_saude_do_canal` (0196). Nenhuma das duas
-- é alcançável por ele.
--
-- **O PostgREST só procura função no schema exposto**, que aqui é `public`.
-- Chamar `/rest/v1/rpc/registrar_saude_do_canal` devolve:
--
--     PGRST202 — Searched for the function public.registrar_saude_do_canal
--                ... but no matches were found in the schema cache.
--
-- Enquanto `responder_lembrete`, que o n8n já chama todo dia, está em `public` e
-- responde 200. Conferido nas duas pontas antes de escrever isto.
--
-- O erro teria passado: as duas migrations aplicaram sem reclamação, os ensaios
-- passaram (eles chamam pelo banco, onde `private` é alcançável) e o pgTAP passou
-- pelo mesmo motivo. **Só a chamada pelo caminho real revela.** É a mesma lição
-- do webhook do n8n em 11/09, quando a URL do `triggerInfo` não era a URL de
-- verdade: o que vale é o caminho que o sistema usa, não o que o teste usa.
--
-- ## Por que fachada em `public`, e não mover
--
-- Migration aplicada não se reescreve — regra da casa. E a fachada tem mérito
-- próprio: a implementação continua em `private`, fora do alcance de quem não
-- deve chamá-la, e o que fica exposto é exatamente a assinatura que o n8n usa.
--
-- `security definer` nas duas porque é o definer (postgres) que alcança
-- `private`; sem ele a fachada chamaria uma função que o `service_role` não pode
-- executar, e o erro trocaria de lugar em vez de sumir.

------------------------------------------------------------------------------
-- A varredura das reservas vencidas (0192)
------------------------------------------------------------------------------
create or replace function public.expirar_reservas()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $function$
  select private.expirar_reservas()
$function$;

-- O trinco, reposto à mão: função nova nasce com execute para `public`.
revoke all on function public.expirar_reservas() from public, anon, authenticated;
grant execute on function public.expirar_reservas() to service_role;

comment on function public.expirar_reservas() is
  'Fachada de private.expirar_reservas para o n8n: o PostgREST so alcanca `public`. Apaga as reservas de vaga vencidas e devolve quantas.';

------------------------------------------------------------------------------
-- O registro da saúde do canal (0196)
------------------------------------------------------------------------------
create or replace function public.registrar_saude_do_canal(
  p_phone_number_id text,
  p_pode_enviar text,
  p_token_envia boolean,
  p_detalhe jsonb default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  select private.registrar_saude_do_canal(
    p_phone_number_id, p_pode_enviar, p_token_envia, p_detalhe
  )
$function$;

revoke all on function public.registrar_saude_do_canal(text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_saude_do_canal(text, text, boolean, jsonb)
  to service_role;

comment on function public.registrar_saude_do_canal(text, text, boolean, jsonb) is
  'Fachada de private.registrar_saude_do_canal para o n8n: o PostgREST so alcanca `public`. Os nomes dos parametros sao o contrato REST -- mudar qualquer um quebra o no do n8n em silencio, porque o PostgREST casa a funcao pelo CONJUNTO de nomes recebidos.';

-- Sem isto a função existe no banco e continua invisível para o PostgREST até ele
-- recarregar o cache por conta própria — e "criei e não funciona" é meia hora
-- procurando o erro no lugar errado.
notify pgrst, 'reload schema';
