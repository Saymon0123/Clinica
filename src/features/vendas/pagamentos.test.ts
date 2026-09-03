import { describe, expect, it } from 'vitest'
import { faltaOuSobra, itemComPrecoValido, lerValor, pagamentosDaComanda, restante } from './pagamentos'

/** Achado 41: metade no Pix, metade em dinheiro — e a soma tem de bater. */
describe('pagamentos da comanda', () => {
  it('uma forma só vale o total, digitado ou não', () => {
    expect(pagamentosDaComanda([{ forma: 'pix', valor: '' }], 50)).toEqual({
      ok: true,
      pagamentos: [{ forma_pagamento: 'pix', valor: 50 }],
    })
  })

  it('dividido: as partes precisam somar o total', () => {
    const r = pagamentosDaComanda(
      [
        { forma: 'pix', valor: '30' },
        { forma: 'dinheiro', valor: '20,00' },
      ],
      50,
    )
    expect(r).toEqual({
      ok: true,
      pagamentos: [
        { forma_pagamento: 'pix', valor: 30 },
        { forma_pagamento: 'dinheiro', valor: 20 },
      ],
    })
  })

  it('soma diferente do total é recusada dizendo os dois números', () => {
    const r = pagamentosDaComanda(
      [
        { forma: 'pix', valor: '30' },
        { forma: 'dinheiro', valor: '15' },
      ],
      50,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/45,00.*50,00/)
  })

  it('parte sem valor, zero ou negativa é recusada', () => {
    for (const valor of ['', '0', '-5', 'abc']) {
      const r = pagamentosDaComanda(
        [
          { forma: 'pix', valor: '50' },
          { forma: 'dinheiro', valor },
        ],
        50,
      )
      expect(r.ok).toBe(false)
    }
  })

  it('tolera meio centavo de arredondamento', () => {
    const r = pagamentosDaComanda(
      [
        { forma: 'pix', valor: '33.33' },
        { forma: 'dinheiro', valor: '33.33' },
        { forma: 'cartao_debito', valor: '33.34' },
      ],
      100,
    )
    expect(r.ok).toBe(true)
  })

  it('falta/sobra e restante ajudam a preencher a última parte', () => {
    const linhas = [
      { forma: 'pix', valor: '30' },
      { forma: 'dinheiro', valor: '' },
    ]
    expect(faltaOuSobra(linhas, 50)).toBe(20)
    expect(restante(linhas, 50, 1)).toBe(20)
    expect(faltaOuSobra([{ forma: 'pix', valor: '' }], 50)).toBeNull()
    expect(restante([{ forma: 'pix', valor: '80' }, { forma: 'dinheiro', valor: '' }], 50, 1)).toBe(0)
  })

  it('lê vírgula e ponto como decimal', () => {
    expect(lerValor('12,5')).toBe(12.5)
    expect(lerValor('12.50')).toBe(12.5)
    expect(lerValor('x')).toBeNaN()
  })

  it('preço zero só é válido no consumo de pacote', () => {
    expect(itemComPrecoValido({ preco_unitario: 0 })).toBe(false)
    expect(itemComPrecoValido({ preco_unitario: 0, viaPacote: 'p1' })).toBe(true)
    expect(itemComPrecoValido({ preco_unitario: 0, viaPacoteNovo: 'u1' })).toBe(true)
    expect(itemComPrecoValido({ preco_unitario: 25 })).toBe(true)
  })
})
