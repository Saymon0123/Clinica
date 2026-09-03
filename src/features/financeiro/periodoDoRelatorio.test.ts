import { describe, expect, it } from 'vitest'
import { intervaloDoRelatorio } from './periodoDoRelatorio'

/** Achado 39: exportar agosto tem de trazer agosto — inteiro, e só ele. */
describe('intervalo do relatório', () => {
  // Quinta-feira, 3 de setembro de 2026, 15h.
  const agora = new Date(2026, 8, 3, 15, 0, 0)

  it('mês navegado: do dia 1 até (exclusive) o dia 1 do mês seguinte', () => {
    const i = intervaloDoRelatorio('mes', '2026-08', agora)
    expect(i.inicio).toEqual(new Date(2026, 7, 1))
    expect(i.fim).toEqual(new Date(2026, 8, 1))
    expect(i.rotulo).toBe('em agosto de 2026')
    expect(i.sufixo).toBe('2026-08')
  })

  it('dezembro vira o ano sem tropeçar', () => {
    const i = intervaloDoRelatorio('mes', '2025-12', agora)
    expect(i.fim).toEqual(new Date(2026, 0, 1))
  })

  it('hoje é o dia inteiro, de meia-noite a meia-noite', () => {
    const i = intervaloDoRelatorio('dia', '2026-08', agora)
    expect(i.inicio).toEqual(new Date(2026, 8, 3))
    expect(i.fim).toEqual(new Date(2026, 8, 4))
    expect(i.sufixo).toBe('dia-2026-09-03')
  })

  it('semana começa na segunda e termina antes da próxima segunda', () => {
    const i = intervaloDoRelatorio('semana', '2026-08', agora)
    expect(i.inicio).toEqual(new Date(2026, 7, 31)) // segunda, 31/08
    expect(i.fim).toEqual(new Date(2026, 8, 7)) // segunda, 07/09
    expect(i.sufixo).toBe('semana-2026-08-31')
  })

  it('no domingo a semana ainda é a que começou na segunda anterior', () => {
    const domingo = new Date(2026, 8, 6, 10)
    const i = intervaloDoRelatorio('semana', '2026-09', domingo)
    expect(i.inicio).toEqual(new Date(2026, 7, 31))
  })
})
