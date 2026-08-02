import { describe, expect, it } from 'vitest'
import { formatarTelefone } from './telefone'

describe('formatarTelefone', () => {
  // O caso que motivou a correção: a aba WEB mostrava "+5 (54) 18727-5895".
  it('formata numero antigo de 8 digitos com DDI', () => {
    expect(formatarTelefone('554187275895')).toBe('+55 (41) 8727-5895')
  })

  it('formata celular de 9 digitos com DDI', () => {
    expect(formatarTelefone('5541987275895')).toBe('+55 (41) 98727-5895')
  })

  it('formata sem DDI, nos dois tamanhos', () => {
    expect(formatarTelefone('4187275895')).toBe('(41) 8727-5895')
    expect(formatarTelefone('41987275895')).toBe('(41) 98727-5895')
  })

  it('ignora a pontuacao que ja vier no valor', () => {
    expect(formatarTelefone('+55 (41) 98727-5895')).toBe('+55 (41) 98727-5895')
    expect(formatarTelefone('41 8727-5895')).toBe('(41) 8727-5895')
  })

  // Melhor devolver como veio do que inventar DDD a partir de um valor
  // incompleto — o dono reconhece o próprio dado, mesmo mal formatado.
  it('devolve como veio quando e curto demais para ter DDD', () => {
    expect(formatarTelefone('987275895')).toBe('987275895')
    expect(formatarTelefone('')).toBe('')
    expect(formatarTelefone('sem numero')).toBe('sem numero')
  })

  // Limite conhecido e aceito: a função assume número brasileiro. Com 12
  // dígitos não há como distinguir 55+DDD+8 de um DDI de 3 dígitos +DDD+7 —
  // a informação simplesmente não está no valor. Como todo cliente chega pelo
  // WhatsApp de uma barbearia brasileira, o palpite de DDI 55 é o certo.
  it('assume numero brasileiro quando o tamanho e ambiguo', () => {
    expect(formatarTelefone('351411234567')).toBe('+35 (14) 1123-4567')
  })
})
