import { describe, expect, it } from 'vitest'
import {
  codigoPareceValido,
  hashIndicaRecuperacao,
  mensagemDeErroDoRetorno,
  normalizarCodigo,
} from './recuperacaoSenha'

describe('hashIndicaRecuperacao', () => {
  it('reconhece o retorno da recuperação de senha', () => {
    expect(
      hashIndicaRecuperacao('#access_token=abc&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery'),
    ).toBe(true)
  })

  it('reconhece com o type em outra posição', () => {
    expect(hashIndicaRecuperacao('#type=recovery&access_token=abc')).toBe(true)
  })

  it('aceita o fragmento sem o #', () => {
    expect(hashIndicaRecuperacao('type=recovery&access_token=abc')).toBe(true)
  })

  // Estes NÃO podem desviar para a tela de nova senha.
  it('ignora o retorno de confirmação de e-mail', () => {
    expect(hashIndicaRecuperacao('#access_token=abc&type=signup')).toBe(false)
  })

  it('ignora o login por magic link', () => {
    expect(hashIndicaRecuperacao('#access_token=abc&type=magiclink')).toBe(false)
  })

  it('ignora o convite', () => {
    expect(hashIndicaRecuperacao('#access_token=abc&type=invite')).toBe(false)
  })

  it('ignora hash de erro, que não traz sessão nenhuma', () => {
    expect(hashIndicaRecuperacao('#error=access_denied&error_code=otp_expired')).toBe(false)
  })

  it('ignora hash comum de navegação', () => {
    expect(hashIndicaRecuperacao('#secao-precos')).toBe(false)
  })

  it('trata ausência de hash', () => {
    expect(hashIndicaRecuperacao('')).toBe(false)
    expect(hashIndicaRecuperacao(null)).toBe(false)
    expect(hashIndicaRecuperacao(undefined)).toBe(false)
  })
})

describe('mensagemDeErroDoRetorno', () => {
  it('explica o link expirado', () => {
    const msg = mensagemDeErroDoRetorno(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    expect(msg).toMatch(/expirou/i)
  })

  it('explica o link já usado ou inválido', () => {
    expect(mensagemDeErroDoRetorno('#error=access_denied')).toMatch(/não é mais válido/i)
  })

  it('tem mensagem genérica para erro desconhecido', () => {
    expect(mensagemDeErroDoRetorno('#error_code=algo_novo')).toMatch(/Peça um novo/i)
  })

  // Sem erro precisa devolver null, senão a tela mostraria alerta à toa.
  it('devolve null quando o retorno foi bem-sucedido', () => {
    expect(mensagemDeErroDoRetorno('#access_token=abc&type=recovery')).toBeNull()
  })

  it('devolve null sem hash', () => {
    expect(mensagemDeErroDoRetorno('')).toBeNull()
    expect(mensagemDeErroDoRetorno(null)).toBeNull()
    expect(mensagemDeErroDoRetorno('#secao-precos')).toBeNull()
  })
})

describe('normalizarCodigo', () => {
  // Copiar do e-mail arrasta espaço, traço e quebra de linha. Sem limpar, o
  // Supabase recusaria um código que está certo.
  it('remove espaços, traços e quebras', () => {
    expect(normalizarCodigo('123 456')).toBe('123456')
    expect(normalizarCodigo('123-456')).toBe('123456')
    expect(normalizarCodigo(' 123456\n')).toBe('123456')
  })

  it('descarta qualquer caractere não numérico', () => {
    expect(normalizarCodigo('Código: 123456.')).toBe('123456')
  })

  it('trata vazio', () => {
    expect(normalizarCodigo('')).toBe('')
  })
})

describe('codigoPareceValido', () => {
  it('aceita 6 dígitos, com ou sem sujeira', () => {
    expect(codigoPareceValido('123456')).toBe(true)
    expect(codigoPareceValido('123 456')).toBe(true)
  })

  /**
   * O caso que quebrou em produção em 2026-08-09: o projeto está configurado
   * para 8 dígitos e a tela recusava o código certo, copiado do e-mail.
   *
   * O teste antigo afirmava `codigoPareceValido('1234567') === false` — ele
   * travava o defeito no lugar em vez de pegá-lo. Um teste só protege o que
   * ele descreve, e este descrevia uma regra que o Supabase não tem.
   */
  it('aceita a faixa inteira que o Supabase permite configurar', () => {
    expect(codigoPareceValido('1234567')).toBe(true)
    expect(codigoPareceValido('12345678')).toBe(true)
    expect(codigoPareceValido('1234567890')).toBe(true)
    expect(codigoPareceValido('1234 5678')).toBe(true)
  })

  it('recusa o que nao pode ser codigo nenhum', () => {
    expect(codigoPareceValido('12345')).toBe(false)
    expect(codigoPareceValido('12345678901')).toBe(false)
    expect(codigoPareceValido('')).toBe(false)
  })
})
