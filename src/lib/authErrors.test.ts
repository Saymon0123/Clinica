import { describe, expect, it } from 'vitest'
import { sessaoExpirou, mensagemDeErroDeLogin } from './authErrors'

describe('mensagemDeErroDeLogin', () => {
  // O caso que motivou a função: chave anon vencida na Vercel fazia a tela
  // acusar a senha do dono, que trocou a senha três vezes sem resolver.
  it('nao culpa a senha quando a chave de API esta invalida', () => {
    const msg = mensagemDeErroDeLogin({ status: 401, message: 'Invalid API key' })
    expect(msg).toMatch(/configuração/i)
    expect(msg).not.toMatch(/senha inválid/i)
  })

  it('culpa a credencial só quando o Supabase diz que é a credencial', () => {
    expect(mensagemDeErroDeLogin({ code: 'invalid_credentials', message: 'x' })).toBe(
      'E-mail ou senha inválidos.',
    )
    expect(mensagemDeErroDeLogin({ status: 400, message: 'Invalid login credentials' })).toBe(
      'E-mail ou senha inválidos.',
    )
  })

  it('distingue falha de rede', () => {
    expect(mensagemDeErroDeLogin({ message: 'Failed to fetch' })).toMatch(/conexão/i)
  })

  it('distingue excesso de tentativas', () => {
    expect(mensagemDeErroDeLogin({ status: 429, message: 'rate limit' })).toMatch(/tentativas/i)
  })

  it('distingue e-mail nao confirmado', () => {
    expect(mensagemDeErroDeLogin({ code: 'email_not_confirmed', message: 'x' })).toMatch(
      /confirme seu e-mail/i,
    )
  })

  it('erro desconhecido nao vira acusacao a senha', () => {
    const msg = mensagemDeErroDeLogin({ status: 500, message: 'boom' })
    expect(msg).not.toMatch(/senha inválid/i)
    expect(msg).toContain('boom')
  })

  it('sem erro devolve mensagem generica', () => {
    expect(mensagemDeErroDeLogin(null)).toMatch(/não foi possível entrar/i)
  })
})

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
