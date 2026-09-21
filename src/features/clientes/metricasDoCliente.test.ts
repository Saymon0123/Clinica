import { describe, expect, it } from 'vitest'
import {
  rotuloDaUltimaVisita,
  rotuloDoRitmo,
  situacaoDoCiclo,
} from './metricasDoCliente'

/**
 * Lote 1 das métricas de campanha: última visita, ritmo e situação.
 *
 * O que se prende:
 *   · sem histórico = null (a ficha mostra travessão, nunca inventa);
 *   · "atrasado" é passar do ritmo PRÓPRIO do cliente, não de um número fixo;
 *   · hoje/ontem têm rótulo humano, não "há 0 dias".
 */

describe('rotuloDaUltimaVisita', () => {
  it('hoje, ontem e ha N dias', () => {
    expect(rotuloDaUltimaVisita(0)).toBe('hoje')
    expect(rotuloDaUltimaVisita(1)).toBe('ontem')
    expect(rotuloDaUltimaVisita(23)).toBe('há 23 dias')
  })
  it('sem visita = null', () => {
    expect(rotuloDaUltimaVisita(null)).toBeNull()
  })
})

describe('rotuloDoRitmo', () => {
  it('mediana vira "a cada ~N dias"; sem regua = null', () => {
    expect(rotuloDoRitmo(15)).toBe('a cada ~15 dias')
    expect(rotuloDoRitmo(null)).toBeNull()
  })
})

describe('situacaoDoCiclo', () => {
  it('atrasado e passar do ritmo proprio', () => {
    expect(situacaoDoCiclo(25, 15)).toEqual({ tipo: 'atrasado', dias: 10 })
  })
  it('dentro do ritmo (ou exatamente nele) esta em dia', () => {
    expect(situacaoDoCiclo(10, 15)).toEqual({ tipo: 'em_dia' })
    expect(situacaoDoCiclo(15, 15)).toEqual({ tipo: 'em_dia' })
  })
  it('sem regua OU sem leitura, nao inventa situacao', () => {
    expect(situacaoDoCiclo(null, 15)).toBeNull()
    expect(situacaoDoCiclo(10, null)).toBeNull()
  })
})
