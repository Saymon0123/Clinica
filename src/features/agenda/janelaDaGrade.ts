/**
 * De que hora a que hora a grade da Agenda é desenhada.
 *
 * Módulo puro de propósito: `AgendaPage` arrasta `supabase.ts`, que exige
 * `.env` já no import, e o runner do CI não tem `.env`.
 *
 * ## Por que isso deixou de ser constante
 *
 * A grade ia das 6h às 22h para toda barbearia. Numa que abre 09:00–19:00,
 * **mais de um terço da altura** eram horas que ela nunca usa — e era essa a
 * sensação de "a agenda podia ser maior": ela não era pequena, era
 * desperdiçada. Encolher a janela para o expediente dá blocos maiores E o dia
 * inteiro sem rolagem, sem ter de escolher entre os dois.
 */

/** Jornada de uma cadeira no dia, em minutos desde a meia-noite. */
export type JornadaDoDia = { inicioMin: number; fimMin: number } | null

/** Só o que a conta precisa de um agendamento. */
export type HorarioNaGrade = { data_hora_inicio: string; data_hora_fim: string }

/**
 * A janela usada quando não há jornada nem horário nenhum para medir — uma
 * barbearia recém-criada, ou um domingo em que ninguém trabalha. 8h–20h em vez
 * das antigas 6h–22h: continua generosa e já corta quatro horas mortas.
 */
export const JANELA_PADRAO = { horaInicio: 8, horaFim: 20 } as const

export type Janela = { horaInicio: number; horaFim: number }

/**
 * A janela do dia: da jornada mais cedo à mais tarde, com uma hora de folga de
 * cada lado.
 *
 * Os AGENDAMENTOS entram na conta junto com a jornada, e não só ela: este
 * projeto **permite encaixe fora do expediente de propósito** (quem valida é o
 * fluxo de criação, não a grade). Um horário das 20h numa barbearia que fecha
 * às 19h ficaria desenhado fora da área visível — existindo no banco e
 * invisível na tela, que é a pior combinação possível.
 */
export function janelaDaGrade(
  jornadas: Record<string, JornadaDoDia>,
  horarios: readonly HorarioNaGrade[],
): Janela {
  const inicios: number[] = []
  const fins: number[] = []

  for (const j of Object.values(jornadas)) {
    if (!j) continue
    inicios.push(j.inicioMin / 60)
    fins.push(j.fimMin / 60)
  }

  for (const h of horarios) {
    const i = new Date(h.data_hora_inicio)
    const f = new Date(h.data_hora_fim)
    if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime())) continue
    inicios.push(i.getHours() + i.getMinutes() / 60)
    fins.push(f.getHours() + f.getMinutes() / 60)
  }

  if (inicios.length === 0) return { ...JANELA_PADRAO }

  const horaInicio = Math.max(0, Math.floor(Math.min(...inicios)) - 1)
  const horaFim = Math.min(24, Math.ceil(Math.max(...fins)) + 1)

  // Piso de duas horas: uma grade de uma hora só ficaria com a régua espremida
  // e sem lugar para arrastar nada.
  if (horaFim - horaInicio < 2) {
    return { horaInicio, horaFim: Math.min(24, horaInicio + 2) }
  }
  return { horaInicio, horaFim }
}
