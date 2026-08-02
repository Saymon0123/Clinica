import { describe, expect, it } from 'vitest'
import { filtrarEOrdenar, naoLida } from './lista'
import type { Conversation } from './types'

function conversa(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    contact_phone: '554187275895',
    contact_name: 'Samuel Rocha',
    last_message_at: '2026-08-02T12:00:00Z',
    last_opened_at: '2026-08-02T13:00:00Z',
    needs_human: false,
    agent_paused: false,
    resumo_contexto: null,
    last_message_preview: null,
    ...over,
  }
}

describe('naoLida', () => {
  it('e nao lida quando a mensagem chegou depois da ultima abertura', () => {
    expect(naoLida({ last_message_at: '2026-08-02T14:00:00Z', last_opened_at: '2026-08-02T13:00:00Z' })).toBe(true)
  })

  it('e lida quando o dono abriu depois da ultima mensagem', () => {
    expect(naoLida({ last_message_at: '2026-08-02T12:00:00Z', last_opened_at: '2026-08-02T13:00:00Z' })).toBe(false)
  })

  it('nunca aberta com mensagem conta como nao lida', () => {
    expect(naoLida({ last_message_at: '2026-08-02T12:00:00Z', last_opened_at: null })).toBe(true)
  })

  it('sem mensagem nenhuma nao conta como nao lida', () => {
    expect(naoLida({ last_message_at: null, last_opened_at: null })).toBe(false)
  })
})

describe('filtrarEOrdenar', () => {
  const lida = conversa({ id: 'lida', contact_name: 'Ana Lida' })
  const pendente = conversa({
    id: 'pendente',
    contact_name: 'Bruno Pendente',
    last_message_at: '2026-08-01T10:00:00Z',
    last_opened_at: null,
  })

  // O motivo da ordenação existir: a lista vem cronológica, então a não lida
  // de ontem afundava abaixo da lida de hoje.
  it('poe as nao lidas na frente mesmo sendo mais antigas', () => {
    expect(filtrarEOrdenar([lida, pendente], '').map((c) => c.id)).toEqual(['pendente', 'lida'])
  })

  it('preserva a ordem original dentro do mesmo grupo', () => {
    const a = conversa({ id: 'a' })
    const b = conversa({ id: 'b' })
    expect(filtrarEOrdenar([a, b], '').map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('busca por nome, sem diferenciar maiuscula', () => {
    expect(filtrarEOrdenar([lida, pendente], 'BRUNO').map((c) => c.id)).toEqual(['pendente'])
  })

  it('busca por telefone comparando so os digitos', () => {
    const c = conversa({ id: 'x', contact_phone: '554187275895', contact_name: null })
    // Todas estas formas precisam achar o mesmo número.
    expect(filtrarEOrdenar([c], '98727')).toHaveLength(0) // 9 extra não existe no valor
    expect(filtrarEOrdenar([c], '8727')).toHaveLength(1)
    expect(filtrarEOrdenar([c], '8727-5895')).toHaveLength(1)
    expect(filtrarEOrdenar([c], '(41) 8727')).toHaveLength(1)
  })

  it('contato sem nome nao quebra a busca por texto', () => {
    const semNome = conversa({ id: 'sem', contact_name: null })
    expect(filtrarEOrdenar([semNome], 'ana')).toHaveLength(0)
  })

  it('busca vazia devolve tudo', () => {
    expect(filtrarEOrdenar([lida, pendente], '   ')).toHaveLength(2)
  })

  it('nao modifica o array recebido', () => {
    const entrada = [lida, pendente]
    filtrarEOrdenar(entrada, '')
    expect(entrada.map((c) => c.id)).toEqual(['lida', 'pendente'])
  })
})
