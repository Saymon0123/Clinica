/**
 * As regras do fechamento de comissão fora do modal, para serem testadas
 * (achado 40 da revisão de 01/09).
 */
export type LinhaDeComissao = {
  id: string
  valor_calculado: number | string
  pago: boolean
  professional_id: string
  nome: string
}

export type PorProfissional = {
  professionalId: string
  nome: string
  pendenteIds: string[]
  pendenteValor: number
  pagoIds: string[]
  pagoValor: number
}

/**
 * Teto da consulta. O PostgREST corta em 1000 linhas em silêncio; pedir
 * explicitamente esse tanto deixa o corte visível — quando a lista bate no
 * teto, o modal avisa que pode estar incompleta em vez de fingir que é tudo.
 */
export const TETO_DE_LINHAS = 1000

export function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, m] = mes.split('-').map(Number)
  return { inicio: new Date(ano, m - 1, 1), fim: new Date(ano, m, 1) }
}

/**
 * "Mês fechado" = já virou. Enquanto o mês é o corrente, marcar como pago
 * pode ser desfeito (um toque errado, um pagamento que não saiu); depois que
 * o mês vira, o fechamento fica registrado como está.
 */
export function mesFechado(mes: string, hoje: Date = new Date()): boolean {
  const [ano, m] = mes.split('-').map(Number)
  return ano < hoje.getFullYear() || (ano === hoje.getFullYear() && m < hoje.getMonth() + 1)
}

export function agruparPorProfissional(linhas: LinhaDeComissao[]): PorProfissional[] {
  const porProf = new Map<string, PorProfissional>()
  for (const linha of linhas) {
    const atual = porProf.get(linha.professional_id) ?? {
      professionalId: linha.professional_id,
      nome: linha.nome,
      pendenteIds: [],
      pendenteValor: 0,
      pagoIds: [],
      pagoValor: 0,
    }
    const valor = Number(linha.valor_calculado) || 0
    if (linha.pago) {
      atual.pagoValor += valor
      atual.pagoIds.push(linha.id)
    } else {
      atual.pendenteValor += valor
      atual.pendenteIds.push(linha.id)
    }
    porProf.set(linha.professional_id, atual)
  }
  return [...porProf.values()].sort((a, b) => b.pendenteValor - a.pendenteValor)
}
