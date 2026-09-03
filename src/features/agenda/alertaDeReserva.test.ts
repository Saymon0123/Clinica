import { describe, expect, it } from 'vitest'
import { deveAvisar } from './alertaDeReserva'

/** Achado 35: o aviso de reserva nova é para o que chega de fora do CRM. */
describe('aviso de novo agendamento', () => {
  it('avisa a reserva que chega de fora: agente, QR do balcão, reativação', () => {
    expect(deveAvisar({ id: 'a1', origem: 'agente', status: 'agendado' })).toBe(true)
    expect(deveAvisar({ id: 'a1', origem: 'publico', status: 'agendado' })).toBe(true)
    expect(deveAvisar({ id: 'a1', origem: 'reativacao', status: 'agendado' })).toBe(true)
  })

  it('não avisa a reserva que a própria equipe acabou de criar na Agenda', () => {
    expect(deveAvisar({ id: 'a1', origem: 'crm', status: 'agendado' })).toBe(false)
  })

  it('sem origem informada, avisa (melhor um aviso a mais que um a menos)', () => {
    expect(deveAvisar({ id: 'a1' })).toBe(true)
  })

  it('bloqueio de horário não é agendamento novo', () => {
    expect(deveAvisar({ id: 'a1', origem: 'agente', status: 'bloqueio' })).toBe(false)
  })
})
