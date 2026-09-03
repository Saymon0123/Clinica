import { describe, expect, it } from 'vitest'
import { chaveDoDia, inicioDaSemana, inicioDoDia, inicioDoMes, mesCorrente } from './periodo'

/** Passo 4.6: semana, mês e dia iguais em todo lugar, e sempre em horário local. */
describe('período', () => {
  // Quinta, 3 de setembro de 2026, 15h47.
  const quinta = new Date(2026, 8, 3, 15, 47)

  it('a semana começa na segunda-feira', () => {
    expect(inicioDaSemana(quinta)).toEqual(new Date(2026, 7, 31))
  })

  it('no domingo, a semana ainda é a que começou na segunda anterior', () => {
    expect(inicioDaSemana(new Date(2026, 8, 6, 10))).toEqual(new Date(2026, 7, 31))
  })

  it('na segunda, a semana começa hoje', () => {
    expect(inicioDaSemana(new Date(2026, 7, 31, 8))).toEqual(new Date(2026, 7, 31))
  })

  it('dia e mês são meia-noite local', () => {
    expect(inicioDoDia(quinta)).toEqual(new Date(2026, 8, 3))
    expect(inicioDoMes(quinta)).toEqual(new Date(2026, 8, 1))
  })

  it('chave do dia e mês corrente são locais, com zero à esquerda', () => {
    expect(chaveDoDia(quinta)).toBe('2026-09-03')
    expect(mesCorrente(quinta)).toBe('2026-09')
  })

  it('às 23h30 do último dia do mês, o mês ainda é este (a virada em UTC não vale)', () => {
    const viradaLocal = new Date(2026, 7, 31, 23, 30)
    expect(mesCorrente(viradaLocal)).toBe('2026-08')
    expect(chaveDoDia(viradaLocal)).toBe('2026-08-31')
  })
})
