/**
 * A janela de um bloqueio: das X às Y, no mesmo dia.
 *
 * Módulo puro de propósito. O `NewAppointmentModal` importa `supabase.ts`, que
 * exige `.env` já no import, e o runner do CI não tem `.env` — teste que
 * importasse de lá morreria antes da primeira asserção. A conta de horário é
 * justamente a parte que merece teste, então ela mora aqui.
 */

/** O CHECK do banco (migration 0182) corta em 60. */
export const MOTIVO_MAX = 60

const MINUTOS_NO_DIA = 24 * 60 - 1

/** 'HH:MM' → minutos desde a meia-noite. Entrada inválida vira 0. */
export function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.min(Math.max(h * 60 + m, 0), MINUTOS_NO_DIA)
}

/** Minutos desde a meia-noite → 'HH:MM', preso dentro do mesmo dia. */
export function horaDe(minutos: number): string {
  const preso = Math.min(Math.max(Math.round(minutos), 0), MINUTOS_NO_DIA)
  const h = Math.floor(preso / 60)
  const m = preso % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Quando o barbeiro muda o INÍCIO, o fim anda junto e a duração é preservada.
 *
 * É o que todo calendário faz, e o contrário irrita: quem já ajustou "até as
 * 14h" e depois adianta o começo em dez minutos não quer o fim recalculado do
 * zero. No fim do dia a janela encolhe em vez de virar a madrugada — bloqueio
 * que cruza a meia-noite não existe aqui, porque o formulário tem uma data só.
 */
export function fimDeslocado(inicioAntes: string, inicioDepois: string, fimAntes: string): string {
  const duracao = Math.max(10, minutosDe(fimAntes) - minutosDe(inicioAntes))
  return horaDe(minutosDe(inicioDepois) + duracao)
}

/**
 * O que impede de salvar, em português — ou `null` quando está de pé.
 *
 * O banco também recusa fim <= início (CHECK `data_hora_fim > data_hora_inicio`),
 * mas de lá volta em inglês e no meio de um formulário isso não diz o que
 * corrigir. A régua é a mesma; só a hora de falar é mais cedo.
 */
export function erroDaJanela(inicio: string, fim: string): string | null {
  if (minutosDe(fim) <= minutosDe(inicio)) {
    return 'O fim do bloqueio precisa ser depois do início.'
  }
  return null
}

/** O dia inteiro, do primeiro ao último minuto. */
export const DIA_INTEIRO = { inicio: '00:00', fim: '23:59' } as const

/**
 * O fim que vai para o BANCO quando o bloqueio é de dia inteiro.
 *
 * **Não é 23:59.** O intervalo do banco é `[início, fim)` — fim aberto —, então
 * terminar às 23:59 deixa o último minuto de fora. Medido em produção: um
 * bloqueio de dia inteiro derrubava os horários livres de **59 para 1**, não
 * para zero, e o que sobrava era exatamente o que começa às **23:59**. O dono
 * bloqueava a folga e ainda dava para marcar naquele dia.
 *
 * O dia inteiro termina na meia-noite SEGUINTE. Por `setDate`, e não somando
 * 24h em milissegundos: assim a virada de mês, de ano e de fuso ficam com o
 * calendário, que sabe fazer isso, em vez de com uma conta minha.
 *
 * Nos campos da tela o fim continua 23:59 — "termina à meia-noite do dia
 * seguinte" é verdade de banco, não frase para quem está marcando uma folga.
 */
export function fimDoDiaInteiro(dia: Date): Date {
  const seguinte = new Date(dia)
  seguinte.setDate(seguinte.getDate() + 1)
  seguinte.setHours(0, 0, 0, 0)
  return seguinte
}
