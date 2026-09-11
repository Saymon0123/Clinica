import { describe, expect, it } from 'vitest'
import { perdasNoIntervalo, rotuloDasPerdas } from './perdas'

const inicio = new Date('2026-09-01T03:00:00.000Z')
const fim = new Date('2026-10-01T02:59:59.999Z')

/** Card "Cancelamentos e faltas": a soma é o número de antes da 0153, e a divisão diz o que é cada um. */
describe('horários perdidos no período', () => {
  it('soma cancelados e faltas, cada um pela sua data', () => {
    const r = perdasNoIntervalo(
      // cancelado_em: dois dentro, um fora (agosto)
      ['2026-09-10T15:00:00Z', '2026-09-30T23:00:00Z', '2026-08-31T12:00:00Z'],
      [
        { status: 'faltou', data_hora_inicio: '2026-09-11T17:00:00Z' },
        { status: 'faltou', data_hora_inicio: '2026-10-02T17:00:00Z' }, // outubro: fora
        { status: 'concluido', data_hora_inicio: '2026-09-12T17:00:00Z' },
        { status: 'agendado', data_hora_inicio: '2026-09-13T17:00:00Z' },
      ],
      inicio,
      fim,
    )
    expect(r).toEqual({ cancelados: 2, faltas: 1, total: 3 })
  })

  it('as bordas do período contam', () => {
    const r = perdasNoIntervalo(
      [inicio.toISOString()],
      [{ status: 'faltou', data_hora_inicio: fim.toISOString() }],
      inicio,
      fim,
    )
    expect(r.total).toBe(2)
  })

  it('a falta conta pela data do HORÁRIO, não por quando o cron a marcou', () => {
    // Horário de 30/09 à noite, marcado como falta já em outubro: é de setembro.
    const r = perdasNoIntervalo([], [{ status: 'faltou', data_hora_inicio: '2026-09-30T23:30:00Z' }], inicio, fim)
    expect(r.faltas).toBe(1)
  })

  it('o rótulo acerta o singular e o plural', () => {
    expect(rotuloDasPerdas({ cancelados: 3, faltas: 2, total: 5 })).toBe('3 cancelados · 2 não vieram')
    expect(rotuloDasPerdas({ cancelados: 1, faltas: 1, total: 2 })).toBe('1 cancelado · 1 não veio')
    expect(rotuloDasPerdas({ cancelados: 0, faltas: 0, total: 0 })).toBe('0 cancelados · 0 não vieram')
  })
})
