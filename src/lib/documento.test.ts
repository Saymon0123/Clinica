import { describe, expect, it } from 'vitest'
import { apenasDigitos, formatarDocumento, problemaNoDocumento } from './documento'

describe('problemaNoDocumento', () => {
  it('aceita CPF valido, com ou sem pontuacao', () => {
    expect(problemaNoDocumento('529.982.247-25')).toBeNull()
    expect(problemaNoDocumento('52998224725')).toBeNull()
  })

  it('aceita CNPJ valido, com ou sem pontuacao', () => {
    expect(problemaNoDocumento('11.222.333/0001-81')).toBeNull()
    expect(problemaNoDocumento('11222333000181')).toBeNull()
  })

  it('recusa CPF com digito verificador errado', () => {
    expect(problemaNoDocumento('529.982.247-24')).toMatch(/CPF não é válido/)
  })

  it('recusa CNPJ com digito verificador errado', () => {
    expect(problemaNoDocumento('11.222.333/0001-82')).toMatch(/CNPJ não é válido/)
  })

  // Passam na conta dos verificadores mas não existem — é o erro clássico de
  // quem valida só a fórmula.
  it('recusa sequencia de digitos repetidos', () => {
    expect(problemaNoDocumento('111.111.111-11')).toMatch(/não é válido/)
    expect(problemaNoDocumento('11.111.111/1111-11')).toMatch(/não é válido/)
  })

  it('reclama do tamanho antes de falar em validade', () => {
    expect(problemaNoDocumento('1234567')).toMatch(/11 dígitos e CNPJ tem 14/)
  })

  it('reclama de vazio', () => {
    expect(problemaNoDocumento('')).toMatch(/Informe o CPF ou CNPJ/)
    expect(problemaNoDocumento('   ')).toMatch(/Informe o CPF ou CNPJ/)
  })
})

describe('formatarDocumento', () => {
  it('formata CPF', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
  })

  it('formata CNPJ', () => {
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('formata parcialmente enquanto a pessoa digita', () => {
    expect(formatarDocumento('529')).toBe('529')
    expect(formatarDocumento('529982')).toBe('529.982')
  })

  it('descarta o que passar de 14 digitos', () => {
    expect(apenasDigitos(formatarDocumento('112223330001819999'))).toHaveLength(14)
  })
})
