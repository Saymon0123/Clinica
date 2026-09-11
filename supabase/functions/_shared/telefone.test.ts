import { describe, expect, it } from 'vitest'
import { AVISO_WHATSAPP_DA_BARBEARIA, somenteDigitos, telefoneValido } from './telefone'

/**
 * A régua das edges é a mesma do banco (`private.telefone_valido`) e da tela
 * (`src/lib/telefone.ts`): se uma delas mudar sozinha, uma porta passa a
 * aceitar o que outra recusa — e o erro aparece como 500 lá na frente.
 */
describe('telefone nas edge functions', () => {
  it('ignora a máscara', () => {
    expect(somenteDigitos('(41) 98727-5895')).toBe('41987275895')
    expect(somenteDigitos(null)).toBe('')
  })

  it('aceita de 10 (fixo com DDD) a 13 dígitos (DDI 55 + DDD + 9)', () => {
    expect(telefoneValido('(41) 3333-4444')).toBe(true)
    expect(telefoneValido('41987275895')).toBe(true)
    expect(telefoneValido('+55 41 98727-5895')).toBe(true)
  })

  it('recusa curto, comprido e vazio', () => {
    expect(telefoneValido('98727-5895')).toBe(false)
    expect(telefoneValido('55419872758951')).toBe(false)
    expect(telefoneValido('')).toBe(false)
    expect(telefoneValido(undefined)).toBe(false)
  })

  it('a frase diz para que serve o número, não só que falta', () => {
    expect(AVISO_WHATSAPP_DA_BARBEARIA).toContain('Falar com a barbearia')
    expect(AVISO_WHATSAPP_DA_BARBEARIA).toContain('10 a 13 dígitos')
  })
})
