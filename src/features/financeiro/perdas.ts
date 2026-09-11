/**
 * Horários perdidos no período: cancelados + faltas.
 *
 * Desde a 0153 o cron grava "não veio" (`faltou`) em vez de cancelar. O card do
 * Financeiro soma os dois de propósito: é o mesmo número que ele mostrava antes,
 * quando a falta entrava como cancelamento, então a comparação com os meses
 * anteriores continua valendo — e a divisão ao lado diz quanto é cada um
 * (achado do plano C, 11/09: sem isto a falta não existia como número, e o card
 * de cancelamentos despencava sem nada ter melhorado).
 *
 * Cada um conta pela data do que ele é: o cancelamento no dia em que ACONTECEU
 * (`cancelado_em` — cancelar hoje um horário de setembro é um cancelamento de
 * hoje); a falta no dia do HORÁRIO.
 */
export type Perdas = { cancelados: number; faltas: number; total: number }

export const SEM_PERDAS: Perdas = { cancelados: 0, faltas: 0, total: 0 }

export function perdasNoIntervalo(
  canceladosEm: string[],
  horarios: { status: string; data_hora_inicio: string }[],
  inicio: Date,
  fim: Date,
): Perdas {
  const de = inicio.getTime()
  const ate = fim.getTime()
  const dentro = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= de && t <= ate
  }
  const cancelados = canceladosEm.filter(dentro).length
  const faltas = horarios.filter((h) => h.status === 'faltou' && dentro(h.data_hora_inicio)).length
  return { cancelados, faltas, total: cancelados + faltas }
}

/** '3 cancelados · 2 não vieram' — a divisão que aparece ao lado do número. */
export function rotuloDasPerdas({ cancelados, faltas }: Perdas): string {
  return `${cancelados} cancelado${cancelados === 1 ? '' : 's'} · ${faltas} não ${faltas === 1 ? 'veio' : 'vieram'}`
}
