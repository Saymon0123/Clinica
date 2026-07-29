import { describe, expect, it } from 'vitest'
import { INSTANCE_PREFIX, instanceNameFor, salonIdFromInstanceName } from './instanceName'

const SALAO = '381a2742-6471-420d-b04b-eac0056e64dd'

describe('instanceNameFor', () => {
  it('produz o nome no formato do contrato', () => {
    expect(instanceNameFor(SALAO)).toBe(`salon-${SALAO}`)
  })

  it('normaliza para minúsculas', () => {
    expect(instanceNameFor(SALAO.toUpperCase())).toBe(`salon-${SALAO}`)
  })

  it('recusa id que não é UUID em vez de gerar nome inválido', () => {
    expect(() => instanceNameFor('')).toThrow()
    expect(() => instanceNameFor('salao-1')).toThrow()
    expect(() => instanceNameFor('381a2742')).toThrow()
  })
})

describe('salonIdFromInstanceName', () => {
  it('extrai o salon_id do nome da instância', () => {
    expect(salonIdFromInstanceName(`salon-${SALAO}`)).toBe(SALAO)
  })

  it('tolera espaços em volta, como chega em payload de webhook', () => {
    expect(salonIdFromInstanceName(`  salon-${SALAO}  `)).toBe(SALAO)
  })

  it('normaliza para minúsculas', () => {
    expect(salonIdFromInstanceName(`salon-${SALAO.toUpperCase()}`)).toBe(SALAO)
  })

  // Cada caso abaixo é uma gravação no salão errado se a função "chutar".
  it('devolve null quando o prefixo não bate', () => {
    expect(salonIdFromInstanceName(`salao-${SALAO}`)).toBeNull()
    expect(salonIdFromInstanceName(SALAO)).toBeNull()
    expect(salonIdFromInstanceName(`barbearia-${SALAO}`)).toBeNull()
  })

  it('devolve null quando o que sobra não é UUID', () => {
    expect(salonIdFromInstanceName('salon-')).toBeNull()
    expect(salonIdFromInstanceName('salon-381a2742')).toBeNull()
    expect(salonIdFromInstanceName('salon-nao-e-uuid')).toBeNull()
  })

  it('não confunde prefixo repetido', () => {
    expect(salonIdFromInstanceName(`salon-salon-${SALAO}`)).toBeNull()
  })

  it('devolve null para ausência de valor', () => {
    expect(salonIdFromInstanceName(null)).toBeNull()
    expect(salonIdFromInstanceName(undefined)).toBeNull()
    expect(salonIdFromInstanceName('')).toBeNull()
  })
})

describe('round-trip', () => {
  it('ida e volta preserva o salon_id', () => {
    expect(salonIdFromInstanceName(instanceNameFor(SALAO))).toBe(SALAO)
  })

  it('o prefixo exportado é o que as duas direções usam', () => {
    expect(instanceNameFor(SALAO).startsWith(INSTANCE_PREFIX)).toBe(true)
  })
})
