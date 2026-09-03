import { beforeEach, describe, expect, it } from 'vitest'
import { adiar, estaAdiado, lerAdiados } from './adiados'

/**
 * "Depois" esconde localmente e volta quando o cliente fala de novo (achado
 * 35 da revisão de 01/09): adiar não pode virar silenciar.
 */
describe('adiar pedido de humano', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('começa vazio e sobrevive dentro da sessão', () => {
    expect(lerAdiados()).toEqual({})
    adiar({}, 'c1', '2026-09-03T10:00:00Z')
    expect(lerAdiados()).toEqual({ c1: '2026-09-03T10:00:00Z' })
  })

  it('esconde o pedido enquanto a última mensagem é a mesma', () => {
    const adiados = adiar({}, 'c1', '2026-09-03T10:00:00Z')
    expect(estaAdiado(adiados, 'c1', '2026-09-03T10:00:00Z')).toBe(true)
  })

  it('volta a mostrar quando o cliente manda outra mensagem', () => {
    const adiados = adiar({}, 'c1', '2026-09-03T10:00:00Z')
    expect(estaAdiado(adiados, 'c1', '2026-09-03T10:05:00Z')).toBe(false)
  })

  it('não confunde conversas nem trata "sem mensagem" como adiado', () => {
    const adiados = adiar({}, 'c1', null)
    expect(estaAdiado(adiados, 'c2', null)).toBe(false)
    expect(estaAdiado(adiados, 'c1', null)).toBe(true)
  })

  it('storage quebrado não derruba a tela', () => {
    sessionStorage.setItem('pedidos-de-humano-adiados', '{nao é json')
    expect(lerAdiados()).toEqual({})
  })
})
