import { describe, expect, it } from 'vitest'
import { ehPedidoDeSaida, normalizarTexto, PALAVRAS_DE_SAIDA } from './optOut'

/**
 * A catraca do opt-out.
 *
 * Não é teste de cortesia: o custo de um falso NEGATIVO aqui é continuar
 * mandando mensagem para quem pediu para parar — LGPD, e denúncia num número
 * central que carrega os avisos de TODAS as barbearias. O custo de um falso
 * positivo é uma campanha a menos para uma pessoa.
 */
describe('normalizarTexto', () => {
  it('tira acento, para "não" casar com o "Nao" do template da Meta', () => {
    expect(normalizarTexto('Não quero mais receber')).toBe('nao quero mais receber')
    expect(normalizarTexto('NÃO QUERO MAIS RECEBER')).toBe('nao quero mais receber')
  })

  it('a regex de acentos combinantes continua viva', () => {
    // Este é o teste que existe por causa do intervalo INVISÍVEL na regex
    // (U+0300–U+036F). Se um editor comer aqueles caracteres, `normalizarTexto`
    // para de tirar acento e o opt-out passa a ignorar quem escreve "não" —
    // silenciosamente. Aqui ele grita.
    expect(normalizarTexto('ãéîõü')).toBe('aeiou')
  })

  it('ignora espaço em volta e ponto final', () => {
    expect(normalizarTexto('  PARAR.  ')).toBe('parar')
    expect(normalizarTexto('Parar!')).toBe('parar')
  })
})

describe('ehPedidoDeSaida', () => {
  it('reconhece o texto exato do botao aprovado pela Meta', () => {
    // Como sai no template submetido: sem acento.
    expect(ehPedidoDeSaida('Nao quero mais receber')).toBe(true)
    // Como a Meta pode devolver, e como a pessoa digitaria.
    expect(ehPedidoDeSaida('Não quero mais receber')).toBe(true)
  })

  it('reconhece as palavras soltas mais comuns', () => {
    for (const p of ['parar', 'PARE', 'Sair', 'stop', 'descadastrar']) {
      expect(ehPedidoDeSaida(p), p).toBe(true)
    }
  })

  it('NAO confunde cancelamento de horario com opt-out', () => {
    // O erro que custaria caro na direção oposta: a pessoa quer desmarcar o
    // corte e sairia da base de reengajamento sem ter pedido.
    expect(ehPedidoDeSaida('cancelar')).toBe(false)
    expect(ehPedidoDeSaida('quero cancelar meu horario')).toBe(false)
    expect(ehPedidoDeSaida('pode cancelar')).toBe(false)
  })

  it('casa a frase inteira, nunca um pedaco dela', () => {
    expect(ehPedidoDeSaida('quero parar de fumar')).toBe(false)
    expect(ehPedidoDeSaida('vou sair mais tarde')).toBe(false)
    expect(ehPedidoDeSaida('tem horario pra parar a barba')).toBe(false)
  })

  it('aguenta vazio, nulo e indefinido sem quebrar o webhook', () => {
    expect(ehPedidoDeSaida('')).toBe(false)
    expect(ehPedidoDeSaida(null)).toBe(false)
    expect(ehPedidoDeSaida(undefined)).toBe(false)
    expect(ehPedidoDeSaida('   ')).toBe(false)
  })

  it('toda palavra da lista ja esta normalizada', () => {
    // Uma entrada com maiúscula ou acento na lista seria inalcançável: a
    // comparação acontece depois de normalizar. Falha silenciosa clássica.
    for (const p of PALAVRAS_DE_SAIDA) {
      expect(normalizarTexto(p), p).toBe(p)
    }
  })
})
