import { describe, expect, it } from 'vitest'
import { computePeriods } from './useFinanceiroData'

/**
 * O filtro "dia" com data escolhida (21/09). O que se prende:
 *   · o dia escolhido vira o período inteiro (00:00–23:59 LOCAL — parse por
 *     partes, porque new Date('YYYY-MM-DD') seria UTC e voltaria um dia no
 *     Brasil);
 *   · o "período anterior" do badge é o dia imediatamente antes;
 *   · o spark são os 7 dias que terminam no escolhido;
 *   · o donut da meta olha o MÊS do dia escolhido, até ele;
 *   · sem refDia, o comportamento antigo (hoje) continua.
 */

describe('computePeriods com dia escolhido', () => {
  const p = computePeriods('dia', '2026-09', '2026-09-10')

  it('o dia escolhido vira o periodo, em horario local', () => {
    expect(p.currentStart.getFullYear()).toBe(2026)
    expect(p.currentStart.getMonth()).toBe(8)
    expect(p.currentStart.getDate()).toBe(10)
    expect(p.currentStart.getHours()).toBe(0)
    expect(p.currentEnd.getDate()).toBe(10)
    expect(p.currentEnd.getHours()).toBe(23)
  })

  it('o periodo anterior e o dia imediatamente antes', () => {
    expect(p.prevStart.getDate()).toBe(9)
    expect(p.prevEnd.getDate()).toBe(9)
  })

  it('o spark sao os 7 dias terminando no escolhido', () => {
    expect(p.sparkDays).toHaveLength(7)
    expect(p.sparkDays[0].getDate()).toBe(4)
    expect(p.sparkDays[6].getDate()).toBe(10)
  })

  it('o donut da meta olha o mes do dia escolhido, ate ele', () => {
    expect(p.monthStart.getDate()).toBe(1)
    expect(p.monthStart.getMonth()).toBe(8)
    expect(p.monthEnd.getDate()).toBe(10)
  })

  it('virada de mes: dia 1 tem anterior no mes passado', () => {
    const virada = computePeriods('dia', '2026-09', '2026-09-01')
    expect(virada.prevStart.getMonth()).toBe(7)
    expect(virada.prevStart.getDate()).toBe(31)
  })

  it('sem refDia, "dia" continua sendo hoje', () => {
    const hoje = new Date()
    const semRef = computePeriods('dia', '2026-09')
    expect(semRef.currentStart.getDate()).toBe(hoje.getDate())
    expect(semRef.currentStart.getMonth()).toBe(hoje.getMonth())
  })
})
