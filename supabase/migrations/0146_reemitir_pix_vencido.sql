-- 0146 — Reemissao de PIX vencido (botao "Gerar novo Pix" na aba Assinatura).
--
-- O buraco: `abacate_pix_id` era gravado UMA vez e nada nunca o voltava a NULL.
-- Como o `cobrar-uso` so enfileira fatura com `abacate_pix_id is null`, fatura
-- que ja teve PIX saia da fila para sempre. E o QR expira em 7 dias, no MESMO
-- instante em que o bloqueio comeca (`cobranca_vence_em`). Resultado: dono que
-- paga no 8o dia fica bloqueado SEM MEIO DE PAGAR -- o QR morreu e o sistema
-- nunca gera outro. So saia com UPDATE na mao.
--
-- A raiz do defeito era amarrar a validade do QR ao prazo da divida. Aqui elas
-- se separam: o QR pode ser reemitido quantas vezes precisar, e `cobranca_vence_em`
-- NAO anda. Se andasse, o botao viraria "adiar o bloqueio para sempre".

-- 1) Historico dos ids ja usados nesta divida.
--
-- Sem isto, limpar o `abacate_pix_id` perderia o vinculo com a cobranca antiga:
-- se o codigo velho fosse pago de algum jeito, o webhook nao acharia a fatura --
-- exatamente o buraco que a 0145 fechou, entrando por outra porta. "QR expirado
-- nao deveria aceitar pagamento" e uma suposicao, e suposicao sobre dinheiro ja
-- traiu este arquivo vezes demais.
alter table public.faturas_de_uso
  add column if not exists pix_anteriores text[];

-- O webhook procura aqui quando nao acha pelo id atual (operador @>).
create index if not exists faturas_de_uso_pix_anteriores_idx
  on public.faturas_de_uso using gin (pix_anteriores);

-- 2) Libera a cobranca para o `cobrar-uso` gerar outra.
--
-- E RPC, e nao UPDATE do PostgREST, porque `array_append(pix_anteriores,
-- abacate_pix_id)` referencia outra coluna da propria linha -- o PostgREST nao
-- expressa isso.
--
-- O que NAO e tocado, de proposito:
--   `cobranca_vence_em` -- e o prazo da divida, nao do QR. Mexer nele seria dar
--                         mais 7 dias de acesso a cada clique.
--   `valor`, `paga_em`  -- a divida nao muda porque o QR morreu.
--
-- `cobranca_notificada_em` volta a NULL para o notificador reenviar o e-mail
-- com o codigo novo -- senao o dono gera o PIX e nunca o recebe.
create or replace function public.liberar_cobranca_para_reemissao(p_pix_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mexidas integer;
begin
  update public.faturas_de_uso
     set pix_anteriores = array_append(coalesce(pix_anteriores, '{}'::text[]), abacate_pix_id),
         abacate_pix_id = null,
         pix_br_code = null,
         pix_br_code_base64 = null,
         pix_expira_em = null,
         cobranca_notificada_em = null
   where abacate_pix_id = p_pix_id
     and paga_em is null;
  get diagnostics v_mexidas = row_count;
  return v_mexidas;
end;
$function$;

-- Quem chama e a edge `cobrar-uso` com a service key, DEPOIS de conferir que
-- quem apertou o botao e dono de alguma unidade da cobranca. Ninguem mais entra.
revoke all on function public.liberar_cobranca_para_reemissao(text) from public, anon, authenticated;
grant execute on function public.liberar_cobranca_para_reemissao(text) to service_role;
