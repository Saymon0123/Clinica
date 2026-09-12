/**
 * O inquilino no log — achado M3 do parecer, redesenhado depois de medir.
 *
 * O parecer dizia "zero log estruturado: 0 ocorrências de `request_id` nas
 * edges". O grep estava certo e a conclusão, errada. A plataforma **já**
 * carimba `request_id` e `execution_id` em toda linha que sai de um
 * `console.*`, e `function_edge_logs` já grava `execution_time_ms` e o status
 * de cada chamada — o p95 que o parecer deu por inexistente é calculável hoje.
 *
 * Construir um id nosso aqui criaria um **segundo** id competindo com o da
 * plataforma, o que é pior do que não ter nenhum.
 *
 * O buraco de verdade era outro: **nada diz de qual barbearia é a requisição**.
 * Dá para juntar as linhas de uma chamada, e não dá para perguntar "o que
 * aconteceu com a barbearia X hoje?".
 *
 * A saída é uma linha só por requisição, no fim, com o salão. As outras se
 * ligam a ela pelo `request_id` que a plataforma já põe:
 *
 *   -- as requisições daquela barbearia
 *   select log_attributes['request_id'] from logs
 *    where source = 'function_logs' and event_message like '%salao=<id>%'
 *
 *   -- e daí TODAS as linhas delas, inclusive as que não sabiam o salão
 *   select * from logs where log_attributes['request_id'] in (...)
 *
 * Assim as 80 linhas de log que já existem ganham inquilino sem que nenhuma
 * delas precise ser reescrita.
 */

/**
 * O que a função descobre sobre a requisição enquanto a atende.
 *
 * É um objeto por invocação — criado no `comSentry`, entregue ao handler.
 * Nada de estado de módulo: o mesmo isolate atende requisições concorrentes, e
 * uma variável compartilhada atribuiria a linha de uma à outra, que é pior do
 * que não registrar nada.
 */
export type ContextoDaRequisicao = {
  /** Preenchido pelo handler assim que ele descobre de quem é a requisição. */
  salao?: string | null
}

/**
 * Anota de quem é a requisição.
 *
 * Nem toda chamada é de uma barbearia só, e fingir que é seria pior do que não
 * anotar: o `cobrar-uso` fecha a conta de todas de uma vez, um webhook do
 * AbacatePay pode quitar faturas de mais de uma, e um POST da Meta pode trazer
 * mensagens de clientes de barbearias diferentes no mesmo corpo, porque o
 * número central atende todas.
 *
 * Então a regra é: a primeira anotação vale; uma segunda, diferente, vira
 * `varios`. Assim a linha de fim diz a verdade nos três casos -- uma barbearia,
 * várias, ou nenhuma conhecida -- e quem consulta sabe quando precisa descer
 * para as linhas internas, que já trazem a chave do grupo.
 */
export function marcarSalao(ctx: ContextoDaRequisicao, salao: string | null | undefined): void {
  if (!salao) return
  if (ctx.salao && ctx.salao !== salao) {
    ctx.salao = 'varios'
    return
  }
  ctx.salao = salao
}

/**
 * O id que a plataforma deu a esta requisição — o mesmo que aparece na coluna
 * `request_id` do log e no header `sb-request-id` da resposta.
 *
 * `x-deno-execution-id` é a reserva: identifica a execução, não a requisição,
 * mas é melhor que nada quando o gateway não repassa o primeiro. Se nenhum dos
 * dois vier, devolve null e quem chama decide — nunca inventa um id, porque um
 * id inventado não casa com coisa nenhuma e dá a impressão de casar.
 */
export function idDaRequisicao(req: Request): string | null {
  return req.headers.get('sb-request-id') ?? req.headers.get('x-deno-execution-id') ?? null
}

/**
 * A linha de fechamento. Uma por requisição, sempre — inclusive quando a função
 * levanta, porque é justamente a que levanta que se quer achar depois.
 *
 * Texto e não JSON: o painel da Supabase mostra `event_message` cru, e a
 * decisão do dono em 12/09 foi manter o log legível a olho. Os pares
 * `chave=valor` são suficientes para o `like` da consulta acima.
 */
export function registrarFim(
  funcao: string,
  ctx: ContextoDaRequisicao,
  status: number | 'erro',
  duracaoMs: number,
  requisicao: string | null,
): void {
  const partes = [
    `fim ${funcao}`,
    `status=${status}`,
    `ms=${duracaoMs}`,
    `salao=${ctx.salao ?? '-'}`,
    `req=${requisicao ?? '-'}`,
  ]
  // `console.error` quando deu erro para o nível no log sair certo: filtrar por
  // nível é a primeira coisa que se faz às 3h da manhã.
  const linha = partes.join(' ')
  if (status === 'erro' || (typeof status === 'number' && status >= 500)) console.error(linha)
  else console.log(linha)
}
