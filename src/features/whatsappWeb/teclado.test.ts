import { describe, expect, it } from 'vitest'
import { enterEnvia } from './teclado'

const tecla = (parcial: Partial<Parameters<typeof enterEnvia>[0]>) => ({
  key: 'Enter',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...parcial,
})

/** Achado 34: no celular Enter é pular linha, não enviar. */
describe('Enter no compositor do /web', () => {
  it('com mouse, Enter envia e Shift+Enter quebra a linha', () => {
    expect(enterEnvia(tecla({}), true)).toBe(true)
    expect(enterEnvia(tecla({ shiftKey: true }), true)).toBe(false)
  })

  it('no toque, Enter só quebra a linha', () => {
    expect(enterEnvia(tecla({}), false)).toBe(false)
  })

  it('Ctrl+Enter e Cmd+Enter enviam em qualquer lugar', () => {
    expect(enterEnvia(tecla({ ctrlKey: true }), false)).toBe(true)
    expect(enterEnvia(tecla({ metaKey: true }), false)).toBe(true)
  })

  it('outra tecla nunca envia', () => {
    expect(enterEnvia(tecla({ key: 'a' }), true)).toBe(false)
  })
})
