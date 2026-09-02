import { describe, expect, it } from 'vitest'
import { parseDataBr } from './dataBr'

describe('parseDataBr', () => {
  it('aceita os dois formatos que aparecem em export de barbearia', () => {
    expect(parseDataBr('2026-07-25')).toBe('2026-07-25')
    expect(parseDataBr('25/07/2026')).toBe('2026-07-25')
    expect(parseDataBr('  25/07/2026  ')).toBe('2026-07-25')
  })

  // Célula vazia é caso legítimo: cliente sem aniversário entra normalmente.
  it('celula vazia e ausencia de data, nao erro', () => {
    expect(parseDataBr('')).toBe(null)
    expect(parseDataBr('   ')).toBe(null)
  })

  // O caso que motivou este arquivo. Casava com o regex, virava '2026-02-31',
  // e o Postgres recusava com 22008 só na hora de gravar — a linha aparecia
  // como "erro do sistema, tente de novo" e não saía no CSV de recusadas.
  it('recusa data que casa com o formato e nao existe no calendario', () => {
    expect(parseDataBr('31/02/2026')).toBe('invalida')
    expect(parseDataBr('30/02/2026')).toBe('invalida')
    expect(parseDataBr('31/04/2026')).toBe('invalida')
    expect(parseDataBr('2026-02-31')).toBe('invalida')
  })

  // Sistema em locale americano exporta mes/dia/ano. O mes 13 nao existe.
  it('recusa mes fora da faixa', () => {
    expect(parseDataBr('07/13/2026')).toBe('invalida')
    expect(parseDataBr('01/00/2026')).toBe('invalida')
  })

  it('recusa dia zero', () => {
    expect(parseDataBr('00/07/2026')).toBe('invalida')
  })

  // 2024 é bissexto, 2026 não. É o limite que separa conferir o calendário de
  // conferir só o formato.
  it('aceita 29 de fevereiro so em ano bissexto', () => {
    expect(parseDataBr('29/02/2024')).toBe('2024-02-29')
    expect(parseDataBr('29/02/2026')).toBe('invalida')
  })

  it('recusa o que nao tem forma de data', () => {
    expect(parseDataBr('25-07-2026')).toBe('invalida')
    expect(parseDataBr('25/7/2026')).toBe('invalida')
    expect(parseDataBr('nao sei')).toBe('invalida')
  })
})
