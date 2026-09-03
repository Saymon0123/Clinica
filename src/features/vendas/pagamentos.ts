/**
 * Pagamento dividido e preço da comanda (achado 41 da revisão de 01/09).
 *
 * "Metade no Pix, metade em dinheiro" é rotina de balcão, e a comanda só
 * gravava UMA forma com o total — o dono marcava tudo como dinheiro, o
 * esperado da gaveta inflava e a conferência do caixa nunca fechava. A tabela
 * `payments` sempre aceitou várias linhas por comanda; faltava a tela.
 */
export type LinhaDePagamento = {
  forma: string
  /** Texto do campo; vazio numa linha única significa "o total". */
  valor: string
}

export type Pagamento = { forma_pagamento: string; valor: number }

export type ResultadoPagamentos =
  | { ok: true; pagamentos: Pagamento[] }
  | { ok: false; erro: string }

const MEIO_CENTAVO = 0.005

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function centavos(v: number) {
  return Math.round(v * 100) / 100
}

/** "12,50" e "12.50" valem o mesmo; qualquer outra coisa é NaN. */
export function lerValor(texto: string): number {
  const n = Number(String(texto).trim().replace(',', '.'))
  return Number.isFinite(n) ? centavos(n) : NaN
}

export function pagamentosDaComanda(linhas: LinhaDePagamento[], total: number): ResultadoPagamentos {
  if (linhas.length === 0) return { ok: false, erro: 'Escolha a forma de pagamento.' }

  // Uma forma só: o valor é o total, digitado ou não.
  if (linhas.length === 1) {
    return { ok: true, pagamentos: [{ forma_pagamento: linhas[0].forma, valor: centavos(total) }] }
  }

  const pagamentos: Pagamento[] = []
  for (const linha of linhas) {
    const valor = lerValor(linha.valor)
    if (!(valor > 0)) {
      return { ok: false, erro: 'Cada parte do pagamento precisa de um valor maior que zero.' }
    }
    pagamentos.push({ forma_pagamento: linha.forma, valor })
  }

  const soma = pagamentos.reduce((s, p) => s + p.valor, 0)
  if (Math.abs(soma - total) > MEIO_CENTAVO) {
    return {
      ok: false,
      erro: `Os pagamentos somam ${moeda(soma)} e o total da comanda é ${moeda(total)}.`,
    }
  }
  return { ok: true, pagamentos }
}

/** Quanto falta (positivo) ou sobra (negativo) para fechar o total; null com uma linha só. */
export function faltaOuSobra(linhas: LinhaDePagamento[], total: number): number | null {
  if (linhas.length <= 1) return null
  const soma = linhas.reduce((s, l) => s + (lerValor(l.valor) || 0), 0)
  return centavos(total - soma)
}

/** O que sobra para a linha `indice` depois das outras. Nunca negativo. */
export function restante(linhas: LinhaDePagamento[], total: number, indice: number): number {
  const outras = linhas.reduce((s, l, i) => (i === indice ? s : s + (lerValor(l.valor) || 0)), 0)
  return Math.max(0, centavos(total - outras))
}

/**
 * Preço editável por item: o único zero legítimo continua sendo o consumo de
 * pacote (o cliente já pagou antes). Desconto entra editando o preço na
 * comanda — não mais no catálogo, que valia para todo mundo.
 */
export function itemComPrecoValido(item: {
  preco_unitario: number
  viaPacote?: string
  viaPacoteNovo?: string
}): boolean {
  if (item.viaPacote || item.viaPacoteNovo) return true
  return Number(item.preco_unitario) > 0
}
