/**
 * O calendário do Financeiro — períodos, janelas e sparklines — em módulo
 * puro, separado do hook de dados de propósito: useFinanceiroData importa o
 * client do Supabase, que EXIGE .env já no import, e o runner do CI não tem
 * .env. O teste de períodos importa daqui e a cadeia não arrasta o client.
 */

export type PeriodFilter = 'dia' | 'mes'

export function dayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export type Periods = {
  currentStart: Date
  currentEnd: Date
  prevStart: Date
  prevEnd: Date
  windowStart: Date
  sparkDays: Date[]
  /** Mês do donut da meta: o mês selecionado no filtro "mes", o mês corrente no "dia". */
  monthStart: Date
  monthEnd: Date
}

/** 'YYYY-MM-DD' → Date LOCAL daquele dia (new Date('YYYY-MM-DD') seria UTC e
 *  voltaria um dia em qualquer fuso negativo — o Brasil inteiro). */
function parseDiaLocal(refDia: string): Date {
  const [ano, mes, dia] = refDia.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

/**
 * refMonth no formato 'YYYY-MM' (filtro "mes"); refDia no formato
 * 'YYYY-MM-DD' — o filtro "dia" deixou de ser sempre hoje (pedido de 21/09:
 * o dono quer descer a qualquer dia e achar os de mais movimento). Sem
 * refDia, "dia" continua sendo hoje.
 */
export function computePeriods(
  filter: PeriodFilter,
  refMonth: string,
  refDia?: string,
  /** Só o teste passa: sem relógio injetável não dá para prender a regra do
   *  recorte igual sem depender do dia em que a suíte roda. */
  agora: Date = new Date(),
): Periods {
  const now = agora

  if (filter === 'dia') {
    const base = refDia ? parseDiaLocal(refDia) : now
    const currentStart = startOfDay(base)
    const currentEnd = endOfDay(base)
    const prevStart = startOfDay(new Date(currentStart.getTime() - 86400000))
    const prevEnd = endOfDay(new Date(currentStart.getTime() - 86400000))
    const sparkDays: Date[] = []
    for (let i = 6; i >= 0; i--) sparkDays.push(startOfDay(new Date(currentStart.getTime() - i * 86400000)))
    const monthStart = startOfDay(new Date(base.getFullYear(), base.getMonth(), 1))
    // A janela precisa cobrir o mês inteiro, senão o donut da meta soma só a
    // última semana — era exatamente esse o defeito no filtro "Hoje".
    const windowStart = monthStart < sparkDays[0] ? monthStart : sparkDays[0]
    return { currentStart, currentEnd, prevStart, prevEnd, windowStart, sparkDays, monthStart, monthEnd: currentEnd }
  }

  const [ano, mes] = refMonth.split('-').map(Number)
  const ehMesCorrente = ano === now.getFullYear() && mes === now.getMonth() + 1
  const currentStart = startOfDay(new Date(ano, mes - 1, 1))
  const ultimoDia = ehMesCorrente ? now.getDate() : new Date(ano, mes, 0).getDate()
  const currentEnd = endOfDay(ehMesCorrente ? now : new Date(ano, mes, 0))
  const prevStart = startOfDay(new Date(ano, mes - 2, 1))
  /**
   * O período anterior termina no MESMO ponto do mês, não no fim dele.
   *
   * Até 06/10 a comparação era "do dia 1 até agora" contra "o mês passado
   * inteiro". No dia 6, isso punha 6 dias contra 30: a conta dá ~80% de queda
   * sempre, e o cartão de faturamento — o primeiro que o dono olha — abria com
   * **"queda de 82,7%" em vermelho** numa barbearia que estava faturando mais
   * que no mês anterior. O número só ficava verde nos últimos dias do mês,
   * quando os dois lados enfim tinham tamanho parecido.
   *
   * Agora, no dia 6, compara 1–6 contra 1–6. O `min` é para o dia 31 cair no
   * último dia de um mês anterior mais curto, em vez de transbordar para o mês
   * seguinte — `new Date(2026, 1, 31)` vira 3 de março, não 31 de fevereiro.
   *
   * Mês fechado (navegou para trás) não entra aqui: ali os dois lados já são
   * meses inteiros, e truncar o anterior é que seria injusto.
   */
  const diasNoMesAnterior = new Date(ano, mes - 1, 0).getDate()
  const prevEnd = endOfDay(
    ehMesCorrente
      ? new Date(ano, mes - 2, Math.min(now.getDate(), diasNoMesAnterior))
      : new Date(ano, mes - 1, 0),
  )
  const sparkDays: Date[] = []
  for (let d = 1; d <= ultimoDia; d++) {
    sparkDays.push(startOfDay(new Date(ano, mes - 1, d)))
  }
  return {
    currentStart,
    currentEnd,
    prevStart,
    prevEnd,
    windowStart: prevStart,
    sparkDays,
    monthStart: currentStart,
    monthEnd: currentEnd,
  }
}
