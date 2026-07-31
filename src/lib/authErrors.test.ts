import { describe, expect, it } from 'vitest'
import { sessaoExpirou } from './authErrors'

describe('sessaoExpirou', () => {
  it('reconhece o código do PostgREST para JWT vencido', () => {
    expect(sessaoExpirou({ code: 'PGRST303', message: 'JWT expired' })).toBe(true)
  })

  it('reconhece pela mensagem quando o código não vem', () => {
    expect(sessaoExpirou({ code: null, message: 'JWT expired' })).toBe(true)
    expect(sessaoExpirou({ message: 'jwt is expired' })).toBe(true)
  })

  // Estes NÃO podem levar o usuário para o login: são falhas de outra natureza,
  // e deslogar esconderia o problema real.
  it('não confunde com erro de permissão', () => {
    expect(sessaoExpirou({ code: '42501', message: 'permission denied for table clients' })).toBe(false)
  })

  it('não confunde com violação de constraint', () => {
    expect(sessaoExpirou({ code: '23505', message: 'duplicate key value' })).toBe(false)
  })

  it('não confunde com JWT inválido (chave errada), que não se resolve renovando', () => {
    expect(sessaoExpirou({ code: 'PGRST301', message: 'JWS signature verification failed' })).toBe(false)
  })

  it('trata ausência de erro', () => {
    expect(sessaoExpirou(null)).toBe(false)
    expect(sessaoExpirou({})).toBe(false)
    expect(sessaoExpirou({ code: null, message: null })).toBe(false)
  })
})
