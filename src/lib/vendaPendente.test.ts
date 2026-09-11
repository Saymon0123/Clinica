import { beforeEach, describe, expect, it } from 'vitest'
import { guardarVendaPendente, lerVendaPendente, quitarVendaPendente } from './vendaPendente'

const SALAO = 'salao-1'

/** Achado 2 do plano C: só a venda DAQUELE horário quita a cobrança pendente. */
describe('quitar a cobrança pendente', () => {
  beforeEach(() => {
    sessionStorage.clear()
    guardarVendaPendente(SALAO, { appointmentId: 'horario-do-joao', clienteNome: 'João' })
  })

  it('venda de outro horário não apaga a pendência', () => {
    expect(quitarVendaPendente(SALAO, 'horario-do-pedro')).toBe(false)
    expect(lerVendaPendente(SALAO)?.appointmentId).toBe('horario-do-joao')
  })

  it('venda sem horário (solta, ou desvinculada) também não', () => {
    expect(quitarVendaPendente(SALAO, null)).toBe(false)
    expect(lerVendaPendente(SALAO)).not.toBeNull()
  })

  it('a venda do próprio horário quita', () => {
    expect(quitarVendaPendente(SALAO, 'horario-do-joao')).toBe(true)
    expect(lerVendaPendente(SALAO)).toBeNull()
  })

  it('a pendência é por barbearia: a mesma venda noutra unidade não mexe nesta', () => {
    expect(quitarVendaPendente('salao-2', 'horario-do-joao')).toBe(false)
    expect(lerVendaPendente(SALAO)?.appointmentId).toBe('horario-do-joao')
  })
})
