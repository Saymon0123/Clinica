/**
 * "Depois" no banner de pedido de humano (achado 35 da revisão de 01/09).
 *
 * O banner não tinha como fechar: as saídas eram abrir o /web ou declarar
 * "Resolvido" — que grava no banco e devolve o cliente ao agente. Para tirar
 * o aviso da frente, o dono gravava uma mentira. "Depois" esconde só aqui,
 * nesta aba, e o pedido continua aberto no banco.
 *
 * A marca guardada é o `last_message_at` do momento do toque: se o cliente
 * mandar outra mensagem, a marca muda e o aviso volta sozinho — adiar não é
 * silenciar.
 */
const CHAVE = 'pedidos-de-humano-adiados'

/** id da conversa → marca (last_message_at) no momento do "Depois". */
export type Adiados = Record<string, string>

export function lerAdiados(): Adiados {
  try {
    const bruto = sessionStorage.getItem(CHAVE)
    const lido: unknown = bruto ? JSON.parse(bruto) : {}
    return lido && typeof lido === 'object' ? (lido as Adiados) : {}
  } catch {
    return {}
  }
}

export function adiar(adiados: Adiados, id: string, marca: string | null): Adiados {
  const novo = { ...adiados, [id]: marca ?? '' }
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(novo))
  } catch {
    // Sem storage (aba privada, cota): o "Depois" dura até o próximo render.
  }
  return novo
}

export function estaAdiado(adiados: Adiados, id: string, marca: string | null): boolean {
  return id in adiados && adiados[id] === (marca ?? '')
}
