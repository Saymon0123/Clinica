import * as Sentry from 'npm:@sentry/deno@10.73.0'
import { idDaRequisicao, registrarFim, type ContextoDaRequisicao } from './log.ts'

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
    // O id da plataforma vira TAG, e não contexto, porque tag é o que se
    // pesquisa no painel do Sentry. É ele que liga a issue às linhas do log --
    // sem isso, achar o erro no Sentry e achar o que aconteceu em volta são
    // duas caçadas separadas. `withScope` aqui é síncrono: o escopo não
    // atravessa `await` nenhum, então duas requisições simultâneas não
    // trocam de tag.
    const requisicao = detalhes?.requisicao
    if (typeof requisicao === 'string' && requisicao) scope.setTag('requisicao', requisicao)
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
  handler: (req: Request, ctx: ContextoDaRequisicao) => Response | Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    // Um objeto por invocação, nunca de módulo: o mesmo isolate atende
    // requisições concorrentes, e estado compartilhado aqui atribuiria o salão
    // de uma chamada à linha de outra -- errado em silêncio, que é o pior jeito.
    const ctx: ContextoDaRequisicao = {}
    const requisicao = idDaRequisicao(req)
    const comecou = Date.now()
    let status: number | 'erro' = 'erro'
    try {
      const resposta = await handler(req, ctx)
      status = resposta.status
      return resposta
    } catch (erro) {
      await capturarErro(erro, funcao, { requisicao })
      throw erro
    } finally {
      // No `finally` de propósito: a requisição que levanta é exatamente a que
      // se quer achar depois, e ela nunca chegaria a um log escrito no caminho
      // feliz. `ctx.salao` sai como '-' quando a função caiu antes de saber de
      // quem era a chamada -- e aí é a verdade, não uma omissão.
      registrarFim(funcao, ctx, status, Date.now() - comecou, requisicao)
    }
  }
}
