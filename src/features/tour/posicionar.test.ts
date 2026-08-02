import { describe, expect, it } from 'vitest'
import { calcularPosicao } from './posicionar'

const JANELA = { largura: 1000, altura: 800 }
const BALAO = { largura: 300, altura: 140 }

describe('calcularPosicao', () => {
  it('fica abaixo quando ha espaco, que e a leitura natural', () => {
    const p = calcularPosicao({ top: 100, left: 400, width: 200, height: 40 }, BALAO, JANELA)
    expect(p.lado).toBe('abaixo')
    expect(p.top).toBe(152) // 100 + 40 + margem
  })

  it('sobe quando nao cabe embaixo', () => {
    const p = calcularPosicao({ top: 700, left: 400, width: 200, height: 40 }, BALAO, JANELA)
    expect(p.lado).toBe('acima')
    expect(p.top).toBe(548) // 700 - 140 - margem
  })

  // Sem isto, um elemento no meio de uma tela baixa deixaria o balão fora da
  // vista. Preso à borda ele ainda comunica.
  it('quando nao cabe em lado nenhum, fica abaixo preso a borda', () => {
    const janelaBaixa = { largura: 1000, altura: 300 }
    const p = calcularPosicao({ top: 120, left: 400, width: 200, height: 40 }, BALAO, janelaBaixa)
    expect(p.lado).toBe('abaixo')
    expect(p.top).toBeLessThanOrEqual(janelaBaixa.altura - BALAO.altura)
    expect(p.top).toBeGreaterThanOrEqual(0)
  })

  it('centraliza no alvo no eixo horizontal', () => {
    const p = calcularPosicao({ top: 100, left: 400, width: 200, height: 40 }, BALAO, JANELA)
    expect(p.left).toBe(350) // 400 + 100 - 150
  })

  // Elemento no canto jogaria metade do balão para fora da tela.
  it('prende o balao dentro da janela nos cantos', () => {
    const esquerda = calcularPosicao({ top: 100, left: 0, width: 40, height: 40 }, BALAO, JANELA)
    expect(esquerda.left).toBe(12)

    const direita = calcularPosicao({ top: 100, left: 960, width: 40, height: 40 }, BALAO, JANELA)
    expect(direita.left).toBe(688) // 1000 - 300 - 12
  })

  it('nao devolve posicao negativa nem em janela menor que o balao', () => {
    const minuscula = { largura: 200, altura: 100 }
    const p = calcularPosicao({ top: 10, left: 10, width: 20, height: 20 }, BALAO, minuscula)
    expect(p.top).toBeGreaterThanOrEqual(0)
    expect(p.left).toBeGreaterThanOrEqual(0)
  })
})
