import { describe, expect, it } from 'vitest'
import { diaParaAbrir, proximoDeQualquerUm, rotuloDoProximo, type BarbeiroDaAgenda } from './barbeiros'

// Quarta-feira, 08/10/2026, 10:00 em São Paulo (13:00 UTC).
const AGORA = new Date('2026-10-08T13:00:00Z')

describe('o próximo horário de cada barbeiro', () => {
  it('hoje', () => {
    expect(rotuloDoProximo('2026-10-08T17:30:00Z', AGORA)).toBe('hoje às 14:30')
  })

  it('amanhã', () => {
    expect(rotuloDoProximo('2026-10-09T12:00:00Z', AGORA)).toBe('amanhã às 09:00')
  })

  it('mais longe: dia da semana e data', () => {
    expect(rotuloDoProximo('2026-10-16T12:00:00Z', AGORA)).toBe('sex, 16/10 às 09:00')
  })

  it('sem vaga é DITO, não escondido', () => {
    expect(rotuloDoProximo(null, AGORA)).toBe('sem vaga nos próximos 14 dias')
    expect(rotuloDoProximo('isso nao e data', AGORA)).toBe('sem vaga nos próximos 14 dias')
  })

  it('O FUSO: às 23h30 de São Paulo, meia-noite e meia é AMANHÃ -- não hoje', () => {
    // 23:30 em SP é 02:30 UTC do dia seguinte. Quem comparasse em UTC diria
    // "hoje" para um horário que é amanhã na barbearia.
    const tardeDaNoite = new Date('2026-10-09T02:30:00Z')
    expect(rotuloDoProximo('2026-10-09T03:30:00Z', tardeDaNoite)).toBe('amanhã às 00:30')
  })
})

describe('em que dia a grade abre depois da escolha', () => {
  const barbeiros: BarbeiroDaAgenda[] = [
    { id: 'diego', nome: 'Diego', proximo: '2026-10-09T12:00:00Z' },
    { id: 'rafael', nome: 'Rafael', proximo: '2026-10-08T17:00:00Z' },
    { id: 'thiago', nome: 'Thiago', proximo: null },
  ]

  it('O CORAÇÃO: abre no dia do próximo horário DELE -- quem só tem amanhã não cai num hoje vazio', () => {
    expect(diaParaAbrir('diego', barbeiros)).toBe('2026-10-09')
  })

  it('"qualquer um" abre no dia mais cedo entre todos', () => {
    expect(diaParaAbrir('qualquer', barbeiros)).toBe('2026-10-08')
    expect(proximoDeQualquerUm(barbeiros)).toBe('2026-10-08T17:00:00Z')
  })

  it('sem vaga na janela: não inventa dia', () => {
    expect(diaParaAbrir('thiago', barbeiros)).toBeNull()
    expect(proximoDeQualquerUm([{ id: 'x', nome: 'X', proximo: null }])).toBeNull()
  })
})
