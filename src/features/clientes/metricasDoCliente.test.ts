import { describe, expect, it } from 'vitest'
import {
  rotuloDaNota,
  rotuloDaUltimaVisita,
  rotuloDeFaltas,
  rotuloDoRitmo,
  rotuloDoServicoDeSempre,
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

describe('rotuloDoServicoDeSempre', () => {
  it('junta o servico com o gancho de produto', () => {
    expect(rotuloDoServicoDeSempre('Corte', false)).toEqual({
      titulo: 'Corte',
      detalhe: 'nunca levou produto',
    })
    expect(rotuloDoServicoDeSempre('Corte', true)).toEqual({
      titulo: 'Corte',
      detalhe: 'e leva produto',
    })
  })
  it('sem consumo registrado nao inventa habito', () => {
    expect(rotuloDoServicoDeSempre(null, false)).toBeNull()
  })
})

describe('rotuloDeFaltas', () => {
  it('singular e plural, separados por ponto', () => {
    expect(rotuloDeFaltas(1, 2)).toBe('1 falta · 2 cancelamentos')
    expect(rotuloDeFaltas(2, 1)).toBe('2 faltas · 1 cancelamento')
  })
  it('so um dos lados aparece quando o outro e zero', () => {
    expect(rotuloDeFaltas(1, 0)).toBe('1 falta')
    expect(rotuloDeFaltas(0, 3)).toBe('3 cancelamentos')
  })
  it('historico limpo e "Nenhum"; sem dados e null', () => {
    expect(rotuloDeFaltas(0, 0)).toBe('Nenhum')
    expect(rotuloDeFaltas(null, null)).toBeNull()
  })
})

describe('rotuloDaNota', () => {
  it('nota com data em DD/MM e o tom certo', () => {
    expect(rotuloDaNota(5, '2026-09-12')).toEqual({ texto: '5 de 5', detalhe: '12/09', tom: 'boa' })
    expect(rotuloDaNota(4, '2026-09-12')).toEqual({ texto: '4 de 5', detalhe: '12/09', tom: 'neutra' })
    expect(rotuloDaNota(3, null)).toEqual({ texto: '3 de 5', detalhe: null, tom: 'ruim' })
  })
  it('sem avaliacao, null', () => {
    expect(rotuloDaNota(null, '2026-09-12')).toBeNull()
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
