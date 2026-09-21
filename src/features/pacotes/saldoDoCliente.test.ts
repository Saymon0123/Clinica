import { describe, expect, it } from 'vitest'
import {
  cobreAlgumServico,
  ordenarPorCobertura,
  rotuloDoSaldo,
  type SaldoDePacote,
} from './saldoDoCliente'

/**
 * A parte pura do saldo na Agenda (parte A do plano de pacotes).
 *
 * O que se prende aqui:
 *   · rótulo copia o número e trata singular — "1 restantes" na tela do dono
 *     é o tipo de descuido que faz o produto parecer amador;
 *   · vencimento vem por corte de string, nunca por Date — fuso do aparelho
 *     não pode mudar o dia impresso;
 *   · saldo VENCIDO ou ZERADO nunca passa — anunciado como usável, viraria
 *     discussão no balcão;
 *   · o saldo que casa com o serviço do agendamento vem primeiro.
 */

function saldo(parte: Partial<SaldoDePacote>): SaldoDePacote {
  return {
    pacote_do_cliente_id: 'pdc-1',
    pacote: '5 cortes',
    service_id: 'svc-corte',
    servico: 'Corte masculino',
    restante: 3,
    expira_em: null,
    vencido: false,
    ...parte,
  }
}

describe('rotuloDoSaldo', () => {
  it('plural com vencimento em DD/MM', () => {
    expect(rotuloDoSaldo(saldo({ restante: 3, expira_em: '2026-10-12' }))).toBe(
      'Corte masculino: 3 restantes (vence 12/10)',
    )
  })

  it('singular quando resta 1', () => {
    expect(rotuloDoSaldo(saldo({ restante: 1 }))).toBe('Corte masculino: 1 restante')
  })

  it('sem vencimento, sem parenteses', () => {
    expect(rotuloDoSaldo(saldo({ restante: 2 }))).toBe('Corte masculino: 2 restantes')
  })
})

describe('ordenarPorCobertura', () => {
  it('o saldo do servico do agendamento vem primeiro', () => {
    const lista = [
      saldo({ service_id: 'svc-barba', servico: 'Barba' }),
      saldo({ service_id: 'svc-corte', servico: 'Corte masculino' }),
    ]
    const ordenado = ordenarPorCobertura(lista, ['svc-corte'])
    expect(ordenado.map((s) => s.servico)).toEqual(['Corte masculino', 'Barba'])
  })

  it('vencido e zerado ficam de fora, mesmo se o chamador esquecer o filtro', () => {
    const lista = [
      saldo({ vencido: true }),
      saldo({ restante: 0, servico: 'Barba', service_id: 'svc-barba' }),
      saldo({ servico: 'Sobrancelha', service_id: 'svc-sob' }),
    ]
    expect(ordenarPorCobertura(lista, []).map((s) => s.servico)).toEqual(['Sobrancelha'])
  })
})

describe('cobreAlgumServico', () => {
  it('true quando um saldo vigente casa com um servico do agendamento', () => {
    expect(cobreAlgumServico([saldo({})], ['svc-corte', 'svc-barba'])).toBe(true)
  })

  it('false quando o saldo e de outro servico', () => {
    expect(cobreAlgumServico([saldo({})], ['svc-barba'])).toBe(false)
  })

  it('saldo vencido ou zerado nao cobre nada', () => {
    expect(cobreAlgumServico([saldo({ vencido: true })], ['svc-corte'])).toBe(false)
    expect(cobreAlgumServico([saldo({ restante: 0 })], ['svc-corte'])).toBe(false)
  })
})
