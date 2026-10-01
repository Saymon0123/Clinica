import { describe, it, expect } from 'vitest'
import { contaDoMes, PROPORCAO_ALTA } from './contaDoMes'

describe('contaDoMes', () => {
  it('diz a proporção com os números reais de setembro na barbearia de amostra', () => {
    // 503 comandas, R$ 35.341 de faturamento; 479 agendamentos cobráveis a
    // R$ 0,75 = R$ 359,25. A frase que o dono vai ler na tela.
    const c = contaDoMes(359.25, 35341)
    expect(c).toEqual({ tipo: 'proporcao', percentual: '1%', alto: false })
  })

  it('não escreve "1,0%" quando a casa decimal é zero', () => {
    const c = contaDoMes(100, 10000)
    expect(c.tipo === 'proporcao' && c.percentual).toBe('1%')
  })

  it('mantém a casa decimal quando ela diz algo', () => {
    const c = contaDoMes(144, 10000)
    expect(c.tipo === 'proporcao' && c.percentual).toBe('1,4%')
  })

  it('nunca escreve 0%: o mês custou algo, só custou pouco', () => {
    // 0,02% arredondaria para 0% com uma casa, e "0%" é mentira.
    const c = contaDoMes(2, 10000)
    expect(c.tipo === 'proporcao' && c.percentual).toBe('menos de 0,1%')
  })

  it('usa vírgula, não ponto: a tela é em português', () => {
    const c = contaDoMes(2346, 10000)
    expect(c.tipo === 'proporcao' && c.percentual).toBe('23,5%')
  })

  it('marca como alto só acima do limite, não nele', () => {
    const noLimite = contaDoMes(PROPORCAO_ALTA, 100)
    expect(noLimite.tipo === 'proporcao' && noLimite.alto).toBe(false)
    const acima = contaDoMes(PROPORCAO_ALTA + 0.1, 100)
    expect(acima.tipo === 'proporcao' && acima.alto).toBe(true)
  })

  it('não esconde a notícia ruim: custo acima do faturamento é dito', () => {
    const c = contaDoMes(150, 100)
    expect(c).toEqual({ tipo: 'proporcao', percentual: '150%', alto: true })
  })

  it('custo sem faturamento não é proporção, mas tem o que dizer', () => {
    // A barbearia que usa o agente e não fecha comanda no CRM. Caminho real:
    // calar aqui faria a tela esconder o custo de quem não vê contrapartida.
    expect(contaDoMes(359.25, 0)).toEqual({ tipo: 'sem_faturamento' })
  })

  it('custo zero cala: teste grátis sem agendamento, ou fora da cobrança', () => {
    expect(contaDoMes(0, 35341)).toEqual({ tipo: 'nada_a_dizer' })
    expect(contaDoMes(0, 0)).toEqual({ tipo: 'nada_a_dizer' })
  })

  it('número que não é número vira silêncio, nunca "NaN%" na tela', () => {
    expect(contaDoMes(Number.NaN, 100)).toEqual({ tipo: 'nada_a_dizer' })
    expect(contaDoMes(100, Number.NaN)).toEqual({ tipo: 'nada_a_dizer' })
    expect(contaDoMes(Number.POSITIVE_INFINITY, 100)).toEqual({ tipo: 'nada_a_dizer' })
  })

  it('valor negativo não inventa sinal', () => {
    expect(contaDoMes(-10, 100)).toEqual({ tipo: 'nada_a_dizer' })
    expect(contaDoMes(100, -10)).toEqual({ tipo: 'sem_faturamento' })
  })
})
