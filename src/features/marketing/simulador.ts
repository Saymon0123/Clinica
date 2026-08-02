/**
 * Matemática do simulador de campanha.
 *
 * Puro de propósito: é a parte que decide se o dono lança ou não a campanha, e
 * precisa ser testável sem banco nem tela.
 *
 * ## O ponto de equilíbrio não é "quantos precisam voltar"
 *
 * A leitura ingênua é: "o desconto custa X, então preciso de N clientes para
 * pagar". Está errada. Numa campanha de sumidos, quem não volta não custa nada
 * — o desconto só é concedido a quem aparece. Por essa conta, qualquer retorno
 * já seria lucro e o número não ajudaria a decidir nada.
 *
 * O custo real é outro: **parte dessas pessoas voltaria sem campanha nenhuma**,
 * e essas ganham desconto à toa. Isso é o vazamento, e é o que a campanha
 * precisa cobrir.
 *
 *   custo    = quem voltaria sozinho × desconto absorvido pela barbearia
 *   ganho    = clientes a mais que a campanha trouxe × margem já descontada
 *
 * O ponto de equilíbrio é quantos clientes **além dos que voltariam sozinhos**
 * precisam aparecer para o ganho cobrir o vazamento. É essa conta que faz o
 * número subir quando o dono aumenta o desconto — que é a razão de o simulador
 * existir.
 */

export type DescontoTipo = 'percentual' | 'valor'

export type EntradaSimulacao = {
  /** Quantos clientes elegíveis no segmento, agora. */
  clientes: number
  /** Quanto esse grupo gasta em média por visita, de vendas fechadas. */
  ticketMedio: number
  descontoTipo: DescontoTipo
  descontoValor: number
  /** Percentual médio de comissão do barbeiro (0–100), de `commissions`. */
  comissaoPercentual: number
  /** Se o desconto reduz a comissão do barbeiro ou é absorvido pela casa. */
  descontoReduzComissao: boolean
  /** Fração de 0 a 1 que voltaria sozinha, sem campanha. */
  taxaRetornoEspontaneo: number
  /** Fração de 0 a 1 que volta com a campanha (inclui os espontâneos). */
  taxaRetornoComCampanha: number
}

export type Simulacao = {
  descontoPorCliente: number
  /** Parte do desconto que sai do bolso da barbearia. */
  descontoAbsorvido: number
  /** Parte do desconto que sai da comissão do barbeiro. */
  descontoDoBarbeiro: number
  /** Ticket menos comissão, antes do desconto. */
  margemPorCliente: number
  /** O que sobra por cliente depois do desconto. */
  margemComDesconto: number
  clientesQueVoltamSozinhos: number
  clientesIncrementais: number
  receitaEstimada: number
  descontoConcedido: number
  custoDoVazamento: number
  resultadoLiquido: number
  /**
   * Quantos clientes além dos espontâneos precisam voltar para empatar.
   * `null` quando o desconto não deixa margem — aí não existe número que
   * resolva, e a tela precisa dizer isso em vez de mostrar um valor enorme.
   */
  clientesParaEmpatar: number | null
  descontoExcedeMargem: boolean
}

function arredonda(valor: number) {
  return Math.round(valor * 100) / 100
}

export function simular(entrada: EntradaSimulacao): Simulacao {
  const {
    clientes,
    ticketMedio,
    descontoTipo,
    descontoValor,
    comissaoPercentual,
    descontoReduzComissao,
    taxaRetornoEspontaneo,
    taxaRetornoComCampanha,
  } = entrada

  const comissao = Math.min(Math.max(comissaoPercentual, 0), 100) / 100

  // Desconto nunca passa do ticket: 120% de desconto não é um cenário, é um
  // erro de digitação, e deixá-lo propagar produz "resultado" negativo sem
  // sentido na tela.
  const descontoBruto =
    descontoTipo === 'percentual' ? ticketMedio * (descontoValor / 100) : descontoValor
  const descontoPorCliente = Math.min(Math.max(descontoBruto, 0), ticketMedio)

  // Com rateio ligado, o barbeiro perde comissão proporcional ao desconto e a
  // barbearia absorve só o resto. Sem rateio, a casa paga sozinha.
  const descontoDoBarbeiro = descontoReduzComissao ? descontoPorCliente * comissao : 0
  const descontoAbsorvido = descontoPorCliente - descontoDoBarbeiro

  const margemPorCliente = ticketMedio * (1 - comissao)
  const margemComDesconto = margemPorCliente - descontoAbsorvido

  const espontaneo = Math.min(Math.max(taxaRetornoEspontaneo, 0), 1)
  const comCampanha = Math.min(Math.max(taxaRetornoComCampanha, 0), 1)

  const clientesQueVoltamSozinhos = clientes * espontaneo
  // Campanha que converte menos que o retorno espontâneo não "tira" clientes:
  // significa que a estimativa não sustenta ganho nenhum.
  const clientesIncrementais = Math.max(clientes * (comCampanha - espontaneo), 0)
  const clientesQueVoltam = clientesQueVoltamSozinhos + clientesIncrementais

  const custoDoVazamento = clientesQueVoltamSozinhos * descontoAbsorvido
  const resultadoLiquido = clientesIncrementais * margemComDesconto - custoDoVazamento

  const clientesParaEmpatar =
    margemComDesconto > 0 ? Math.ceil(custoDoVazamento / margemComDesconto) : null

  return {
    descontoPorCliente: arredonda(descontoPorCliente),
    descontoAbsorvido: arredonda(descontoAbsorvido),
    descontoDoBarbeiro: arredonda(descontoDoBarbeiro),
    margemPorCliente: arredonda(margemPorCliente),
    margemComDesconto: arredonda(margemComDesconto),
    clientesQueVoltamSozinhos: Math.round(clientesQueVoltamSozinhos),
    clientesIncrementais: Math.round(clientesIncrementais),
    receitaEstimada: arredonda(clientesQueVoltam * (ticketMedio - descontoPorCliente)),
    descontoConcedido: arredonda(clientesQueVoltam * descontoPorCliente),
    custoDoVazamento: arredonda(custoDoVazamento),
    resultadoLiquido: arredonda(resultadoLiquido),
    clientesParaEmpatar,
    descontoExcedeMargem: descontoAbsorvido >= margemPorCliente,
  }
}

export type SegmentoId = 'sumidos' | 'uma_vez' | 'aniversariantes' | 'ocioso'

/**
 * Taxas por segmento. São **prudência, não medição** — a partir da segunda
 * campanha do salão, o valor real medido substitui estes (fase 4 do desenho).
 */
export const TAXAS_PADRAO: Record<SegmentoId, { espontaneo: number; comCampanha: number }> = {
  // Sumiu há mais de 60 dias: uma parcela pequena volta por conta própria.
  sumidos: { espontaneo: 0.05, comCampanha: 0.12 },
  // Veio uma vez e nunca voltou: quase ninguém volta sozinho.
  uma_vez: { espontaneo: 0.03, comCampanha: 0.1 },
  // Aniversariante costuma ser cliente ativo — muitos viriam de qualquer jeito,
  // e é por isso que esta campanha é a que mais vaza desconto.
  aniversariantes: { espontaneo: 0.25, comCampanha: 0.4 },
  // Cliente ativo convidado para outro horário: alto retorno, alto vazamento.
  ocioso: { espontaneo: 0.3, comCampanha: 0.45 },
}
