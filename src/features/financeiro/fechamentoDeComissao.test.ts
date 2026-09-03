import { describe, expect, it } from 'vitest'
import { agruparPorProfissional, intervaloDoMes, mesFechado } from './fechamentoDeComissao'

/**
 * Achado 40: fechar comissão pede confirmação e pode ser desfeito enquanto o
 * mês não vira. Passo 4.2: card e modal somam pela MESMA função.
 */
describe('fechamento de comissão', () => {
  const linhas = [
    { id: 'c1', valor_calculado: 10, pago: false, professional_id: 'p1', nome: 'João', base: 20 },
    { id: 'c2', valor_calculado: '5.50', pago: true, professional_id: 'p1', nome: 'João', base: 11 },
    { id: 'c3', valor_calculado: 20, pago: false, professional_id: 'p2', nome: 'Pedro', base: 40 },
  ]

  it('agrupa por profissional separando o que falta pagar do que já foi', () => {
    const grupos = agruparPorProfissional(linhas)
    expect(grupos.map((g) => g.nome)).toEqual(['Pedro', 'João'])
    const joao = grupos.find((g) => g.professionalId === 'p1')!
    expect(joao.pendenteIds).toEqual(['c1'])
    expect(joao.pendenteValor).toBe(10)
    expect(joao.pagoIds).toEqual(['c2'])
    expect(joao.pagoValor).toBe(5.5)
  })

  it('o total do card é pendente + pago, sobre a base somada (4.2)', () => {
    const joao = agruparPorProfissional(linhas).find((g) => g.professionalId === 'p1')!
    expect(joao.valor).toBe(15.5)
    expect(joao.base).toBe(31)
    // 15,5 / 31 = 50%: o percentual exibido é a média ponderada.
    expect((joao.valor / joao.base) * 100).toBeCloseTo(50)
  })

  it('sem base informada, a base é zero e nada quebra', () => {
    const [pedro] = agruparPorProfissional([
      { id: 'c3', valor_calculado: 20, pago: false, professional_id: 'p2', nome: 'Pedro' },
    ])
    expect(pedro.base).toBe(0)
    expect(pedro.valor).toBe(20)
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
