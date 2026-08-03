/**
 * Quanto custa trocar de plano no meio do ciclo.
 *
 * Regra decidida em 2026-08-02: quem sobe de plano paga só a diferença
 * proporcional aos dias que ainda faltam, e usa o plano novo na hora. Cobrar o
 * mês cheio faria quem troca no dia 25 pagar por 30 dias de um plano que vai
 * usar por 5.
 *
 * Módulo separado, sem nada de Deno, para poder ser testado pelo vitest junto
 * com o resto do projeto — a conta erra dinheiro do cliente, e errar aqui não
 * aparece em log nenhum.
 */

/** Valor mínimo que o Asaas aceita numa cobrança. */
export const MINIMO_ASAAS = 5

export type Proporcional = {
  /** Dias que faltam até o fim do período já pago. */
  diasRestantes: number
  /** Dias que o ciclo mensal atual tem ao todo. */
  diasDoCiclo: number
  /** Diferença mensal cheia entre os dois planos. */
  diferencaMensal: number
  /** O que o dono paga agora. Zero quando não há o que cobrar. */
  valor: number
  /**
   * Abaixo do mínimo do Asaas, e por isso dispensado.
   *
   * Acontece quando faltam poucos dias. Cobrar o mínimo seria cobrar mais do
   * que se deve; adiar a troca para o próximo ciclo seria negar o que o dono
   * pediu. Liberar sai mais barato que qualquer uma das duas — e são centavos.
   */
  dispensado: boolean
}

function diasEntre(de: Date, ate: Date) {
  return Math.round((ate.getTime() - de.getTime()) / 86400000)
}

function comoData(iso: string) {
  // Meio-dia UTC evita que fuso empurre a data para o dia anterior.
  return new Date(`${iso}T12:00:00Z`)
}

/**
 * @param acessoAte fim do período já pago (`subscriptions.acesso_ate`)
 * @param precoAtual mensalidade do plano de hoje
 * @param precoNovo mensalidade do plano desejado
 * @param hoje data de referência, injetada para o teste não depender do relógio
 */
export function calcularProporcional(
  acessoAte: string | null,
  precoAtual: number,
  precoNovo: number,
  hoje: Date = new Date(),
): Proporcional {
  const diferencaMensal = Number((precoNovo - precoAtual).toFixed(2))

  // Sem data de fim não há período a ratear (barbearia com cobrança por fora).
  if (!acessoAte) {
    return { diasRestantes: 0, diasDoCiclo: 0, diferencaMensal, valor: 0, dispensado: true }
  }

  const fim = comoData(acessoAte)
  const referencia = comoData(hoje.toISOString().slice(0, 10))

  // O ciclo é o mês que termina em `acesso_ate` — não 30 dias fixos, senão
  // fevereiro e março cobrariam a mesma coisa por períodos diferentes.
  const inicioDoCiclo = new Date(fim)
  inicioDoCiclo.setUTCMonth(inicioDoCiclo.getUTCMonth() - 1)

  const diasDoCiclo = diasEntre(inicioDoCiclo, fim)
  const diasRestantes = Math.max(0, Math.min(diasEntre(referencia, fim), diasDoCiclo))

  // Descer de plano não gera cobrança: pela decisão de 2026-08-02 o dono segue
  // no plano atual até o fim do que pagou, e a troca vale na renovação.
  if (diferencaMensal <= 0) {
    return { diasRestantes, diasDoCiclo, diferencaMensal, valor: 0, dispensado: true }
  }

  const bruto = (diferencaMensal * diasRestantes) / diasDoCiclo
  const valor = Number(bruto.toFixed(2))

  if (valor < MINIMO_ASAAS) {
    return { diasRestantes, diasDoCiclo, diferencaMensal, valor: 0, dispensado: true }
  }

  return { diasRestantes, diasDoCiclo, diferencaMensal, valor, dispensado: false }
}
