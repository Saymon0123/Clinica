import { describe, expect, it } from 'vitest'
import { agruparPorProfissional, intervaloDoMes, mesFechado } from './fechamentoDeComissao'

/** Achado 40: fechar comissão pede confirmação e pode ser desfeito enquanto o mês não vira. */
describe('fechamento de comissão', () => {
  it('agrupa por profissional separando o que falta pagar do que já foi', () => {
    const grupos = agruparPorProfissional([
      { id: 'c1', valor_calculado: 10, pago: false, professional_id: 'p1', nome: 'João' },
      { id: 'c2', valor_calculado: '5.50', pago: true, professional_id: 'p1', nome: 'João' },
      { id: 'c3', valor_calculado: 20, pago: false, professional_id: 'p2', nome: 'Pedro' },
    ])
    expect(grupos.map((g) => g.nome)).toEqual(['Pedro', 'João'])
    const joao = grupos.find((g) => g.professionalId === 'p1')!
    expect(joao.pendenteIds).toEqual(['c1'])
    expect(joao.pendenteValor).toBe(10)
    expect(joao.pagoIds).toEqual(['c2'])
    expect(joao.pagoValor).toBe(5.5)
  })

  it('o mês corrente está aberto; o anterior, fechado', () => {
    const hoje = new Date(2026, 8, 3)
    expect(mesFechado('2026-09', hoje)).toBe(false)
    expect(mesFechado('2026-08', hoje)).toBe(true)
    expect(mesFechado('2025-12', hoje)).toBe(true)
    expect(mesFechado('2026-10', hoje)).toBe(false)
  })

  it('o intervalo do mês é meio-aberto e vira o ano', () => {
    expect(intervaloDoMes('2026-12')).toEqual({ inicio: new Date(2026, 11, 1), fim: new Date(2027, 0, 1) })
  })
})
