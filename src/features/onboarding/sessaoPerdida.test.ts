import { describe, expect, it } from 'vitest'
import { ehFalhaDeSessao } from './sessaoPerdida'

describe('sessão perdida no meio do cadastro', () => {
  it('reconhece as duas frases de 401 da funcao, como o servidor as escreve', () => {
    // Sem acento: é assim que a edge function responde hoje.
    expect(ehFalhaDeSessao('Nao autorizado.')).toBe(true)
    expect(ehFalhaDeSessao('Sessao invalida. Entre de novo.')).toBe(true)
  })

  it('reconhece as mesmas frases acentuadas, para nao quebrar se o servidor mudar', () => {
    expect(ehFalhaDeSessao('Não autorizado.')).toBe(true)
    expect(ehFalhaDeSessao('Sessão inválida. Entre de novo.')).toBe(true)
  })

  it('nao confunde erro de preenchimento com sessao perdida', () => {
    // Estes têm conserto na própria tela: mandar a pessoa para o login
    // apagaria o que ela digitou sem motivo.
    expect(ehFalhaDeSessao('Informe seu nome.')).toBe(false)
    expect(ehFalhaDeSessao('Informe o nome da barbearia.')).toBe(false)
    expect(ehFalhaDeSessao('E preciso aceitar os termos de uso para continuar.')).toBe(false)
  })

  it('nao confunde falha do servidor com sessao perdida', () => {
    // Aqui tentar de novo faz sentido; mandar para o login, não.
    expect(ehFalhaDeSessao('Nao foi possivel criar a barbearia. Tente novamente.')).toBe(false)
    expect(ehFalhaDeSessao('Muitos cadastros a partir desta conexao. Tente novamente amanha.')).toBe(
      false,
    )
    expect(ehFalhaDeSessao('Confirme seu e-mail antes de continuar.')).toBe(false)
  })

  it('trata ausencia de mensagem', () => {
    expect(ehFalhaDeSessao(null)).toBe(false)
    expect(ehFalhaDeSessao(undefined)).toBe(false)
    expect(ehFalhaDeSessao('')).toBe(false)
  })
})
