/**
 * Quanto o sistema custou, do que entrou.
 *
 * O medidor já mostrava os dois números lado a lado — o custo do mês e o
 * faturamento — e ninguém dividia um pelo outro. A divisão é a única pergunta
 * que o dono realmente tem ("isto é caro?"), e deixá-la de tarefa de casa é o
 * mesmo que não responder.
 *
 * Mora aqui, e não na tela, pelo motivo de sempre neste projeto: módulo puro
 * tem teste, e teste de unidade não pode importar nada que arraste
 * `src/lib/supabase.ts` — o client exige `.env` já no import, e o runner do CI
 * não tem `.env`.
 *
 * As duas pontas têm de vir da MESMA janela, e é o banco que garante isso: a
 * view `uso_do_sistema_no_mes` calcula custo e faturamento no mesmo
 * `date_trunc('month')` do relógio de São Paulo (migration 0190). Esta função
 * só recebe os dois números prontos — ela não sabe de data, e é por isso que
 * ela pode ser testada sem viajar no tempo.
 */

/** Acima disto o número deixa de ser boa notícia, e o tom muda com ele. */
export const PROPORCAO_ALTA = 5

export type ContaDoMes =
  /** Os dois números existem: dá para dizer a proporção. */
  | { tipo: 'proporcao'; percentual: string; alto: boolean }
  /** Custo sem faturamento. Não há proporção, mas há o que dizer. */
  | { tipo: 'sem_faturamento' }
  /** Custo zero: teste grátis sem agendamento, ou barbearia fora da cobrança. */
  | { tipo: 'nada_a_dizer' }

/**
 * Escreve o percentual na régua que não mente.
 *
 * `0%` seria mentira: o mês custou algo, só custou pouco. Por isso o piso é
 * "menos de 0,1%" em vez do arredondamento para zero. Acima disso, uma casa
 * decimal, e a casa some quando é `,0` — "1%" lê melhor que "1,0%" e diz
 * exatamente o mesmo.
 */
function escreveProporcao(proporcao: number): string {
  if (proporcao < 0.1) return 'menos de 0,1%'
  const umaCasa = Math.round(proporcao * 10) / 10
  return `${umaCasa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function contaDoMes(custo: number, faturamento: number): ContaDoMes {
  // Número que não é número vira silêncio, nunca "NaN%" na cara do dono.
  if (!Number.isFinite(custo) || !Number.isFinite(faturamento)) return { tipo: 'nada_a_dizer' }
  if (custo <= 0) return { tipo: 'nada_a_dizer' }
  // Faturamento negativo não existe no sistema (todo `payments.valor` é > 0 por
  // CHECK), mas se um dia existir estorno a divisão não pode inventar sinal.
  if (faturamento <= 0) return { tipo: 'sem_faturamento' }

  const proporcao = (custo / faturamento) * 100
  return {
    tipo: 'proporcao',
    percentual: escreveProporcao(proporcao),
    // `>` e não `>=`: 5% redondo ainda é o lado bom da conta.
    alto: proporcao > PROPORCAO_ALTA,
  }
}
