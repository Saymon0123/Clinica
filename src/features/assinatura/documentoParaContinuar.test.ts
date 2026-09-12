import { describe, expect, it } from 'vitest'
import { lerMotivoDoBloqueio, pedidoDeDocumento } from './documentoParaContinuar'

const emTeste = { status: 'trial', acessoAte: '2026-09-11', expirada: false, documentoOk: false }

/** M2: sem documento de quem paga, o teste acaba e o acesso não renova. */
describe('documento para continuar depois do teste', () => {
  it('le o motivo do bloqueio que vem do banco, e nada alem dele', () => {
    expect(lerMotivoDoBloqueio('sem_documento')).toBe('sem_documento')
    expect(lerMotivoDoBloqueio('cobranca_vencida')).toBe('cobranca_vencida')
    expect(lerMotivoDoBloqueio(null)).toBeNull()
    expect(lerMotivoDoBloqueio(undefined)).toBeNull()
    expect(lerMotivoDoBloqueio('outra_coisa')).toBeNull()
  })

  it('pede o documento durante o teste, antes de travar', () => {
    expect(pedidoDeDocumento(emTeste)).toMatch(/depois do teste/)
  })

  it('depois que travou, promete o que o banco cumpre: volta na hora', () => {
    expect(pedidoDeDocumento({ ...emTeste, expirada: true })).toMatch(/volta na hora/)
  })

  it('nao pede nada com documento em dia, sem vencimento automatico ou a quem cancelou', () => {
    expect(pedidoDeDocumento({ ...emTeste, documentoOk: true })).toBeNull()
    expect(pedidoDeDocumento({ ...emTeste, acessoAte: null })).toBeNull()
    expect(pedidoDeDocumento({ ...emTeste, status: 'cancelada', expirada: true })).toBeNull()
  })

  it('fora do teste e sem documento, avisa que o acesso nao renova', () => {
    expect(pedidoDeDocumento({ ...emTeste, status: 'ativa' })).toMatch(/não renova/)
  })
})
