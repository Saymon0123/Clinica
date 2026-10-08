/**
 * A escolha de barbeiro da agenda pública (migration 0218).
 *
 * O cliente escolhe um barbeiro ou "qualquer um". Os dois caminhos terminam do
 * mesmo jeito -- um agendamento gravado com UM barbeiro --, e a diferença mora
 * em quem decide: no primeiro, o cliente; no segundo, a régua do banco
 * (`agenda_publica_candidatos`: menos agendamentos no dia, depois menos minutos,
 * depois sorteio).
 *
 * MORA EM `_shared` PARA TER TESTE, como `servicos.ts`: o `index.ts` da edge não
 * é alcançado pelo vitest, e a decisão de qual barbeiro fica com o cliente é das
 * que não vale confiar em leitura de código.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 'qualquer' ou o id de um barbeiro. */
export type Escolha = 'qualquer' | string

/**
 * O barbeiro pedido no corpo da requisição.
 *
 * Nulo para ausente E para inválido, de propósito: os dois viram a mesma
 * resposta lá fora ("escolha um horário"), e um texto qualquer nunca chega ao
 * banco como se fosse um id.
 */
export function lerEscolha(bruto: unknown): Escolha | null {
  if (typeof bruto !== 'string') return null
  const valor = bruto.trim()
  if (valor === 'qualquer') return 'qualquer'
  return UUID_RE.test(valor) ? valor.toLowerCase() : null
}

/** Um barbeiro que a régua aceita para aquele instante. */
export type Candidato = { professional_id: string; profissional: string }

/** O que uma tentativa de gravar devolve. `conflito` é a trava de sobreposição
 *  do banco (23P01): a vaga sumiu entre a consulta e a gravação. */
export type Tentativa<T> = { ok: true; valor: T } | { ok: false; conflito: boolean; erro?: unknown }

export type Resultado<T> =
  | { ok: true; valor: T; quem: Candidato }
  | { ok: false; motivo: 'sem_candidato' | 'todos_ocupados' | 'erro'; erro?: unknown }

/**
 * Tenta gravar com cada candidato, NA ORDEM em que vieram.
 *
 * POR QUE ISTO EXISTE. Duas pessoas escolhem "qualquer um" para as 15h ao mesmo
 * tempo. As duas recebem o mesmo primeiro candidato, e a trava do banco aceita
 * só uma. A segunda NÃO deve ver "esse horário acabou de ser pego": ainda há
 * outro barbeiro livre às 15h, e ela pediu justamente qualquer um. Então segue
 * para o próximo da lista.
 *
 * SÓ O CONFLITO faz seguir. Qualquer outro erro para tudo: se o banco recusou
 * por outro motivo, insistir com o barbeiro seguinte só repetiria a falha, e
 * pior, poderia gravar onde não devia.
 *
 * A ORDEM É DO BANCO e é respeitada à risca -- nada aqui reordena. É a régua do
 * dono que decide quem vem primeiro.
 */
export async function tentarEmOrdem<T>(
  candidatos: Candidato[],
  tentar: (candidato: Candidato) => Promise<Tentativa<T>>,
): Promise<Resultado<T>> {
  if (!candidatos.length) return { ok: false, motivo: 'sem_candidato' }
  for (const candidato of candidatos) {
    const r = await tentar(candidato)
    if (r.ok) return { ok: true, valor: r.valor, quem: candidato }
    if (!r.conflito) return { ok: false, motivo: 'erro', erro: r.erro }
  }
  return { ok: false, motivo: 'todos_ocupados' }
}
