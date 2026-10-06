import { describe, expect, it } from 'vitest'
// Do módulo puro, não do hook: o hook importa o client do Supabase, que
// exige .env já no import — e o runner do CI não tem .env (quebrou lá,
// passava aqui). Importar daqui mantém o teste rodando em qualquer máquina.
import { computePeriods } from './computePeriods'

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

/**
 * O RECORTE IGUAL (06/10).
 *
 * Até aqui o filtro "Este mês" comparava "do dia 1 até agora" contra "o mês
 * passado INTEIRO". No dia 6, eram 6 dias contra 30 — uma queda de ~80% por
 * construção, estampada em vermelho no cartão de faturamento de uma barbearia
 * que estava indo bem. Só virava verde nos últimos dias do mês.
 *
 * A asserção que não pode cair é a primeira: o período anterior termina no
 * MESMO dia do mês que o atual. Qualquer volta ao "mês anterior inteiro" a
 * derruba.
 */
describe('computePeriods: o periodo anterior usa o mesmo recorte', () => {
  it('no dia 6, compara 1-6 contra 1-6 do mes passado', () => {
    const p = computePeriods('mes', '2026-10', undefined, new Date(2026, 9, 6, 15, 30))
    expect(p.currentStart.getDate()).toBe(1)
    expect(p.currentEnd.getDate()).toBe(6)
    expect(p.prevStart.getMonth()).toBe(8) // setembro
    expect(p.prevStart.getDate()).toBe(1)
    expect(p.prevEnd.getMonth()).toBe(8)
    expect(p.prevEnd.getDate()).toBe(6)
  })

  it('o anterior cobre a mesma quantidade de dias que o atual', () => {
    const p = computePeriods('mes', '2026-10', undefined, new Date(2026, 9, 6, 15, 30))
    const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)
    expect(dias(p.prevStart, p.prevEnd)).toBe(dias(p.currentStart, p.currentEnd))
  })

  it('dia 31 contra um mes anterior mais curto para no ultimo dia dele', () => {
    // 31/03 contra fevereiro, que tem 28 em 2026: sem o `min`, o JavaScript
    // empurraria para 3 de marco e a comparacao sairia do mes.
    const p = computePeriods('mes', '2026-03', undefined, new Date(2026, 2, 31, 10, 0))
    expect(p.prevEnd.getMonth()).toBe(1) // fevereiro
    expect(p.prevEnd.getDate()).toBe(28)
  })

  it('mes ja fechado continua comparando mes inteiro contra mes inteiro', () => {
    // Navegou para agosto estando em outubro: os dois lados sao meses cheios.
    const p = computePeriods('mes', '2026-08', undefined, new Date(2026, 9, 6, 15, 30))
    expect(p.currentEnd.getDate()).toBe(31) // agosto inteiro
    expect(p.prevEnd.getMonth()).toBe(6) // julho
    expect(p.prevEnd.getDate()).toBe(31) // julho inteiro
  })

  it('sem relogio injetado, o comportamento e o de hoje', () => {
    const agora = new Date()
    const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const comRelogio = computePeriods('mes', mes, undefined, agora)
    const semRelogio = computePeriods('mes', mes)
    expect(semRelogio.prevEnd.getDate()).toBe(comRelogio.prevEnd.getDate())
  })
})
