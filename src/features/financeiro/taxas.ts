/**
 * As três taxas do barbeiro, em módulo puro.
 *
 * Separado do hook de propósito: `useDesempenho` importa o client do Supabase,
 * que exige `.env` já no import, e o runner do CI não tem `.env`. A conta é
 * justamente o que merece teste, então ela mora aqui.
 *
 * ## Por que tudo devolve `number | null`
 *
 * Porque **não ter denominador não é zero**. Uma barbearia sem jornada
 * cadastrada tem ocupação *indefinida*, não 0% — e mostrar "0%" ali acusaria o
 * barbeiro de uma preguiça que é, na verdade, um cadastro faltando. O `null`
 * obriga a tela a dizer qual é o caso.
 */

/** O que a RPC `desempenho_do_periodo` (migration 0183) devolve. */
export type Desempenho = {
  minutosJornada: number
  minutosOcupados: number
  atendimentos: number
  servicos: number
  clientes: number
  clientesQueVoltaram: number
}

export const DESEMPENHO_VAZIO: Desempenho = {
  minutosJornada: 0,
  minutosOcupados: 0,
  atendimentos: 0,
  servicos: 0,
  clientes: 0,
  clientesQueVoltaram: 0,
}

/**
 * Quanto da jornada virou atendimento, de 0 a 100.
 *
 * `null` quando não há jornada cadastrada. Referência de mercado: 40 a 60% é o
 * normal de uma barbearia; subir para 70% costuma valer perto de +40% de
 * receita sem um cliente novo sequer.
 */
export function ocupacao(d: Desempenho): number | null {
  if (d.minutosJornada <= 0) return null
  // Pode passar de 100: encaixe fora do expediente é permitido de propósito
  // (quem valida é o fluxo de criação, não a grade). Não se corta em 100 --
  // "110%" é a notícia de que ele está atendendo fora da jornada que cadastrou.
  return (d.minutosOcupados / d.minutosJornada) * 100
}

/**
 * Dos clientes atendidos no período, quantos por cento têm outro horário
 * depois — já cumprido ou ainda marcado. `null` sem atendimento nenhum.
 */
export function taxaDeRetorno(d: Desempenho): number | null {
  if (d.clientes <= 0) return null
  return (d.clientesQueVoltaram / d.clientes) * 100
}

/** Média de serviços por atendimento concluído. `null` sem atendimento. */
export function servicosPorAtendimento(d: Desempenho): number | null {
  if (d.atendimentos <= 0) return null
  return d.servicos / d.atendimentos
}

/**
 * Minutos em horas legíveis: 460 → "7h40", 2040 → "34h".
 *
 * Sem casa decimal e sem "min" solto: o número está ao lado de outro número
 * maior, e o que o barbeiro precisa é comparar as duas grandezas de relance.
 */
export function formatHoras(minutos: number): string {
  const total = Math.max(Math.round(minutos), 0)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Percentual com uma casa e vírgula, do jeito que se lê em português. */
export function formatPercentual(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}%`
}

/** Média com uma casa e vírgula: 1.333… → "1,3". */
export function formatMedia(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

/**
 * Para onde a taxa andou desde o período anterior.
 *
 * Devolve só a DIREÇÃO, e nunca o tamanho do passo. É de propósito: a diferença
 * entre dois percentuais se mede em pontos, não em porcentagem — sair de 10%
 * para 12% é "mais dois pontos", e escrever "+20%" ali seria mentira. Como
 * "ponto percentual" é jargão que ninguém usa cortando cabelo, a tela mostra a
 * seta e o valor anterior por extenso ("antes 10,0%"), e deixa a conta para
 * quem quiser fazer.
 */
export function direcao(atual: number | null, anterior: number | null): 'subiu' | 'desceu' | 'igual' | null {
  if (atual === null || anterior === null) return null
  const delta = atual - anterior
  // Meio ponto de zona morta: sem isso, 12,01% contra 12,00% acende uma seta
  // verde que não significa nada.
  if (Math.abs(delta) < 0.5) return 'igual'
  return delta > 0 ? 'subiu' : 'desceu'
}

// ---------------------------------------------------------------------------
// Parte 2 do item 14: de onde vem o dinheiro. Tudo daqui para baixo é DE
// GESTÃO — sai de faturamento, e faturamento é do dono (decisão de 21/09).
// ---------------------------------------------------------------------------

/** O que a RPC `composicao_do_periodo` (migration 0184) devolve. */
export type Composicao = {
  /** Soma dos `payments` — a MESMA base do cartão "Faturamento" da tela. */
  faturamento: number
  comandas: number
  /** Soma dos itens. Pode divergir do faturamento: desconto, pacote cobrindo
   *  item, pagamento parcial. É a base honesta da composição, porque
   *  `payments` não sabe O QUE foi comprado. */
  vendidoTotal: number
  vendidoServico: number
  vendidoProduto: number
  vendidoPacote: number
  /** 0=domingo … 6=sábado, ou `null` quando não houve venda no período. */
  melhorDia: number | null
  melhorDiaFaturamento: number
  melhorDiaComandas: number
}

export const COMPOSICAO_VAZIA: Composicao = {
  faturamento: 0,
  comandas: 0,
  vendidoTotal: 0,
  vendidoServico: 0,
  vendidoProduto: 0,
  vendidoPacote: 0,
  melhorDia: null,
  melhorDiaFaturamento: 0,
  melhorDiaComandas: 0,
}

/** Faturamento dividido pelas comandas fechadas. `null` sem comanda. */
export function ticketMedio(c: Composicao): number | null {
  if (c.comandas <= 0) return null
  return c.faturamento / c.comandas
}

/**
 * Participação de uma parte no que foi vendido, de 0 a 100.
 *
 * O denominador é `vendidoTotal`, e não o faturamento: são bases diferentes, e
 * misturar as duas produziria um percentual que não fecha em 100.
 */
export function participacao(parte: number, total: number): number | null {
  if (total <= 0) return null
  return (parte / total) * 100
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function nomeDoDia(dow: number): string {
  return DIAS[dow] ?? '—'
}

/**
 * Quantas comandas o período precisa ter para que apontar um dia signifique
 * alguma coisa, e quantas o dia vencedor precisa ter.
 *
 * Não é estatística: é um piso contra dizer bobagem. Sete dias da semana
 * repartindo seis vendas dão um "vencedor" com duas, e "terça é o seu melhor
 * dia" nesse caso não é um relatório — é ruído com cara de conselho, do tipo
 * que faz alguém remarcar a escala da equipe por nada.
 */
export const MINIMO_DE_COMANDAS = 10
export const MINIMO_NO_DIA = 3

export type MelhorDia = { nome: string; faturamento: number; comandas: number }

/** `null` quando não houve venda, ou quando houve pouca demais para falar. */
export function melhorDiaDaSemana(c: Composicao): MelhorDia | null {
  if (c.melhorDia === null) return null
  if (c.comandas < MINIMO_DE_COMANDAS) return null
  if (c.melhorDiaComandas < MINIMO_NO_DIA) return null
  return {
    nome: nomeDoDia(c.melhorDia),
    faturamento: c.melhorDiaFaturamento,
    comandas: c.melhorDiaComandas,
  }
}

/** Reais no formato brasileiro, sem centavos quando são zero. */
export function formatReal(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
