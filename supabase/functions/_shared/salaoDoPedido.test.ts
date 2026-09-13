import { describe, expect, it } from 'vitest'
import { SemSalao, salaoDoPedido } from './salaoDoPedido'

/**
 * O QUE ESTE TESTE PEGA, E O QUE NÃO PEGA — dito na cara, para ninguém confiar
 * demais nele.
 *
 * PEGA: alguém afrouxar `salaoDoPedido` para aceitar pedido sem salão (devolver
 * `''`, ou o primeiro de uma lista, ou `null`).
 *
 * NÃO PEGA: alguém reescrever o fallback direto no `whatsapp/index.ts`, sem
 * passar por aqui. Foi assim que o defeito nasceu em 26/07 e sobreviveu 49
 * dias. Isto é um guarda documentado, não uma catraca sobre o repositório
 * inteiro — diferente de `views_com_invoker.test.sql`, que varre o schema e
 * pega view nova que ninguém lembrou de conferir.
 */
describe('salaoDoPedido', () => {
  it('devolve o salão quando o pedido diz qual é', () => {
    expect(salaoDoPedido({ salonId: '4748d5b4-9184-4a70-add9-02c1dda88f12' })).toBe(
      '4748d5b4-9184-4a70-add9-02c1dda88f12',
    )
  })

  it('tira o espaço em volta', () => {
    expect(salaoDoPedido({ salonId: '  4748d5b4-9184-4a70-add9-02c1dda88f12  ' })).toBe(
      '4748d5b4-9184-4a70-add9-02c1dda88f12',
    )
  })

  it('RECUSA pedido sem salão em vez de escolher um', () => {
    // O caso que motivou o módulo. Recusar é a resposta certa: `disconnect`
    // sem salão derrubaria o WhatsApp de uma unidade qualquer do dono.
    expect(() => salaoDoPedido({})).toThrow(SemSalao)
    expect(() => salaoDoPedido({ salonId: undefined })).toThrow(SemSalao)
  })

  it('RECUSA string vazia e só espaço — que é como um campo em branco chega', () => {
    expect(() => salaoDoPedido({ salonId: '' })).toThrow(SemSalao)
    expect(() => salaoDoPedido({ salonId: '   ' })).toThrow(SemSalao)
  })

  it('RECUSA o que não é texto — o corpo vem de req.json() e aceita qualquer coisa', () => {
    expect(() => salaoDoPedido({ salonId: null })).toThrow(SemSalao)
    expect(() => salaoDoPedido({ salonId: 42 })).toThrow(SemSalao)
    expect(() => salaoDoPedido({ salonId: ['a', 'b'] })).toThrow(SemSalao)
    expect(() => salaoDoPedido({ salonId: { id: 'x' } })).toThrow(SemSalao)
  })

  it('RECUSA corpo ausente — `req.json()` falha e o chamador segue com nada', () => {
    // A edge function faz `try { body = await req.json() } catch { /* sem corpo */ }`.
    expect(() => salaoDoPedido(null)).toThrow(SemSalao)
    expect(() => salaoDoPedido(undefined)).toThrow(SemSalao)
  })
})
