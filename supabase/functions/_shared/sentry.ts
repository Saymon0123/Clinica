import * as Sentry from 'npm:@sentry/deno@10.73.0'

/**
 * Sentry das edge functions — mesma conta do CRM (org club-cut), diferenciado
 * pelas tags. Sem o secret SENTRY_DSN tudo aqui vira no-op e a função roda
 * exatamente como antes; é o mesmo contrato do front (src/lib/sentry.ts).
 *
 * `defaultIntegrations: false` porque o Edge Runtime da Supabase não expõe
 * tudo que o SDK de Deno espera — a captura aqui é explícita de todo jeito.
 */
const dsn = Deno.env.get('SENTRY_DSN')

if (dsn) {
  Sentry.init({
    dsn,
    environment: 'edge-functions',
    defaultIntegrations: false,
  })
  Sentry.setTag('regiao', Deno.env.get('SB_REGION') ?? 'desconhecida')
}

/**
 * Registra um erro que a função tratou (respondeu 500 — ou 200, no caso do
 * whatsapp-webhook) mas que precisa aparecer no painel: o `console.error`
 * sozinho morre num log que ninguém olha.
 *
 * O `flush` espera o envio de verdade antes de seguir. O isolate pode
 * congelar logo depois da resposta, e evento na fila sem flush é evento
 * perdido. Custa até 2s, só no caminho de erro.
 */
export async function capturarErro(
  erro: unknown,
  funcao: string,
  detalhes?: Record<string, unknown>,
): Promise<boolean> {
  if (!dsn) return false
  Sentry.withScope((scope) => {
    scope.setTag('funcao', funcao)
    if (detalhes) scope.setContext('detalhes', detalhes)
    Sentry.captureException(erro)
  })
  // O boolean diz se a fila esvaziou dentro do prazo — é a prova de entrega.
  return await Sentry.flush(2000)
}

/**
 * Última rede, para o que estourar FORA do try/catch da própria função
 * (parse antes do try, bug no próprio catch). Captura e relança: a resposta
 * 500 continua vindo do runtime, idêntica à de antes.
 */
export function comSentry(
  funcao: string,
  handler: (req: Request) => Response | Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req)
    } catch (erro) {
      await capturarErro(erro, funcao)
      throw erro
    }
  }
}
