import { describe, expect, it } from 'vitest'
import { montarThread, rotuloDoDia } from './thread'
import type { Message } from './types'

const AGORA = new Date('2026-08-02T15:00:00-03:00')

function msg(over: Partial<Message> & { id: string; created_at: string }): Message {
  return {
    conversation_id: 'conv',
    direction: 'out',
    sender: 'agente',
    content: 'oi',
    ...over,
  }
}

describe('rotuloDoDia', () => {
  it('usa Hoje e Ontem em vez da data', () => {
    expect(rotuloDoDia('2026-08-02T09:00:00-03:00', AGORA)).toBe('Hoje')
    expect(rotuloDoDia('2026-08-01T09:00:00-03:00', AGORA)).toBe('Ontem')
  })

  it('cai na data para o resto', () => {
    expect(rotuloDoDia('2026-07-20T09:00:00-03:00', AGORA)).toBe('20/07/26')
  })

  // O dia é o local, não o UTC: 23h de Brasília já é o dia seguinte em UTC, e
  // marcar isso como "amanhã" faria a conversa da noite aparecer no dia errado.
  it('separa o dia pelo fuso local, nao pelo UTC', () => {
    expect(rotuloDoDia('2026-08-02T23:30:00-03:00', AGORA)).toBe('Hoje')
  })
})

describe('montarThread', () => {
  it('poe um separador antes do primeiro item de cada dia', () => {
    const itens = montarThread(
      [
        msg({ id: 'a', created_at: '2026-08-01T10:00:00-03:00' }),
        msg({ id: 'b', created_at: '2026-08-02T10:00:00-03:00' }),
      ],
      AGORA,
    )
    expect(itens.map((i) => i.tipo)).toEqual(['dia', 'mensagem', 'dia', 'mensagem'])
    expect(itens.filter((i) => i.tipo === 'dia').map((i) => i.rotulo)).toEqual(['Ontem', 'Hoje'])
  })

  // Era o incômodo visual: tres respostas seguidas do agente repetiam a
  // assinatura tres vezes.
  it('assina so a ultima mensagem de um bloco do mesmo remetente', () => {
    const itens = montarThread(
      [
        msg({ id: 'a', created_at: '2026-08-02T10:00:00-03:00' }),
        msg({ id: 'b', created_at: '2026-08-02T10:01:00-03:00' }),
        msg({ id: 'c', created_at: '2026-08-02T10:02:00-03:00' }),
      ],
      AGORA,
    )
    const mensagens = itens.filter((i) => i.tipo === 'mensagem')
    expect(mensagens.map((m) => m.ultimaDoBloco)).toEqual([false, false, true])
  })

  it('troca de remetente fecha o bloco', () => {
    const itens = montarThread(
      [
        msg({ id: 'a', created_at: '2026-08-02T10:00:00-03:00', sender: 'cliente', direction: 'in' }),
        msg({ id: 'b', created_at: '2026-08-02T10:01:00-03:00', sender: 'agente', direction: 'out' }),
      ],
      AGORA,
    )
    const mensagens = itens.filter((i) => i.tipo === 'mensagem')
    expect(mensagens.map((m) => m.ultimaDoBloco)).toEqual([true, true])
  })

  it('virada de dia fecha o bloco mesmo com o mesmo remetente', () => {
    const itens = montarThread(
      [
        msg({ id: 'a', created_at: '2026-08-01T23:00:00-03:00' }),
        msg({ id: 'b', created_at: '2026-08-02T09:00:00-03:00' }),
      ],
      AGORA,
    )
    const mensagens = itens.filter((i) => i.tipo === 'mensagem')
    expect(mensagens.map((m) => m.ultimaDoBloco)).toEqual([true, true])
  })

  it('conversa vazia devolve lista vazia', () => {
    expect(montarThread([], AGORA)).toEqual([])
  })

  it('as chaves nao se repetem', () => {
    const itens = montarThread(
      [
        msg({ id: 'a', created_at: '2026-08-01T10:00:00-03:00' }),
        msg({ id: 'b', created_at: '2026-08-02T10:00:00-03:00' }),
      ],
      AGORA,
    )
    const chaves = itens.map((i) => i.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})
