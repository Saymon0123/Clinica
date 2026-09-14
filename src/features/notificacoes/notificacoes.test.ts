import { describe, expect, it } from 'vitest'
import {
  contarNaoVistas,
  rotuloDaNotificacao,
  tempoRelativo,
  type Notificacao,
} from './notificacoes'

function n(sobre: Partial<Notificacao>): Notificacao {
  return {
    chave: 'novo_horario:x',
    tipo: 'novo_horario',
    evento_em: '2026-09-14T12:00:00Z',
    data_hora_inicio: '2026-09-20T17:00:00Z',
    origem: 'publico',
    cliente: 'João',
    barbeiro: 'Rafa',
    servicos: 'Corte + Barba',
    ...sobre,
  }
}

describe('rotuloDaNotificacao', () => {
  it('novo horário diz quem, o quê e por onde', () => {
    const r = rotuloDaNotificacao(n({}))
    expect(r.titulo).toBe('João marcou Corte + Barba')
    expect(r.detalhe).toContain('com Rafa')
    expect(r.detalhe).toContain('pelo QR')
  })

  it('agente vira "pelo WhatsApp"', () => {
    expect(rotuloDaNotificacao(n({ origem: 'agente' })).detalhe).toContain('pelo WhatsApp')
  })

  it('cancelou fala do horário que ERA; remarcou, do que AGORA É', () => {
    expect(rotuloDaNotificacao(n({ tipo: 'cancelou' })).titulo).toBe('João cancelou o horário')
    expect(rotuloDaNotificacao(n({ tipo: 'cancelou' })).detalhe).toMatch(/^era /)
    expect(rotuloDaNotificacao(n({ tipo: 'remarcou' })).detalhe).toMatch(/^agora é /)
  })

  it('campos nulos caem em palavras neutras, nunca em "null"', () => {
    // Cliente apagado da base ou serviço removido não podem virar
    // "null marcou undefined" no sino.
    const r = rotuloDaNotificacao(n({ cliente: null, barbeiro: null, servicos: null }))
    expect(r.titulo).toBe('Um cliente marcou um horário')
    expect(r.detalhe).not.toContain('null')
    expect(r.detalhe).not.toContain('com ')
  })
})

describe('tempoRelativo', () => {
  const agora = new Date('2026-09-14T12:00:00')

  it('escala: agora → minutos → horas → ontem → data', () => {
    expect(tempoRelativo('2026-09-14T11:59:30', agora)).toBe('agora')
    expect(tempoRelativo('2026-09-14T11:55:00', agora)).toBe('há 5 min')
    expect(tempoRelativo('2026-09-14T09:00:00', agora)).toBe('há 3 h')
    expect(tempoRelativo('2026-09-13T08:00:00', agora)).toBe('ontem')
    expect(tempoRelativo('2026-09-10T08:00:00', agora)).toBe('10/09')
  })

  it('madrugada de ontem com menos de 24h de distância ainda é "há N h"', () => {
    // 23:00 de ontem → 13h atrás. "ontem" só quando já passou de 24h — senão
    // duas notificações da mesma noite alternariam entre "há 13 h" e "ontem".
    expect(tempoRelativo('2026-09-13T23:00:00', agora)).toBe('há 13 h')
  })
})

describe('contarNaoVistas', () => {
  const lista = [
    n({ chave: 'a', evento_em: '2026-09-14T10:00:00Z' }),
    n({ chave: 'b', evento_em: '2026-09-14T11:00:00Z' }),
    n({ chave: 'c', evento_em: '2026-09-14T12:00:00Z' }),
  ]

  it('sem marco, tudo conta — quem nunca abriu o sino tem tudo por ver', () => {
    expect(contarNaoVistas(lista, null)).toBe(3)
  })

  it('conta só o que chegou DEPOIS do marco, exclusivo', () => {
    expect(contarNaoVistas(lista, '2026-09-14T11:00:00Z')).toBe(1)
    expect(contarNaoVistas(lista, '2026-09-14T12:00:00Z')).toBe(0)
  })

  it('lista vazia é zero com ou sem marco', () => {
    expect(contarNaoVistas([], null)).toBe(0)
    expect(contarNaoVistas([], '2026-09-14T11:00:00Z')).toBe(0)
  })
})
