import { describe, expect, it } from 'vitest'
import { avisoDaPausa } from './pausaDaReativacao'

// Data montada no fuso LOCAL, como a formatação: o teste dá o mesmo resultado
// no CI (UTC) e na máquina do balcão.
const em = new Date(2026, 7, 12, 10, 0).toISOString()

/** Achado 1 do plano C: a pausa aparece, com o motivo, em vez do campo pré-preenchido. */
describe('aviso da pausa da reserva automática', () => {
  it('pediu para parar: alerta e pede para só preencher se ele pedir de novo', () => {
    expect(avisoDaPausa({ em, motivo: 'pediu_para_parar' })).toEqual({
      texto: 'Em 12/08, ele pediu pelo WhatsApp para não reservarmos mais. Só preencha se ele pedir de novo.',
      pediuParaParar: true,
    })
  })

  it('faltas e falta de resposta: diz o motivo e que preencher retoma', () => {
    expect(avisoDaPausa({ em, motivo: 'faltas' }).texto).toBe(
      'Parado desde 12/08: faltou a 2 horários reservados. Preencher retoma a reserva automática.',
    )
    expect(avisoDaPausa({ em, motivo: 'sem_resposta' }).texto).toBe(
      'Parado desde 12/08: não respondeu a 2 convites. Preencher retoma a reserva automática.',
    )
    expect(avisoDaPausa({ em, motivo: 'faltas' }).pediuParaParar).toBe(false)
  })

  it('pausa antiga, sem motivo gravado: não inventa um', () => {
    expect(avisoDaPausa({ em, motivo: null }).texto).toBe(
      'Parado desde 12/08. Preencher retoma a reserva automática.',
    )
  })
})
