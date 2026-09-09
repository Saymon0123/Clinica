import { afterEach, describe, expect, it, vi } from 'vitest'
import { gerarId } from './id'

const FORMATO_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gerarId', () => {
  it('usa crypto.randomUUID quando o navegador tem', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { randomUUID })
    expect(gerarId()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  // O incidente: navegador antigo (Chrome 79) sem randomUUID, mas com
  // getRandomValues. Antes do fallback, era aqui que a landing caía.
  it('monta um UUID v4 válido quando só existe getRandomValues', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (b: Uint8Array) => {
        for (let i = 0; i < b.length; i += 1) b[i] = i
        return b
      },
    })
    expect(gerarId()).toMatch(FORMATO_UUID_V4)
  })

  it('crava versão 4 e variante RFC 4122 mesmo com bytes todos 0xff', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (b: Uint8Array) => b.fill(0xff),
    })
    const id = gerarId()
    expect(id).toMatch(FORMATO_UUID_V4)
    expect(id[14]).toBe('4') // dígito de versão
    expect(['8', '9', 'a', 'b']).toContain(id[19]) // dígito de variante
  })

  it('cai num id não-criptográfico quando não há Web Crypto', () => {
    vi.stubGlobal('crypto', undefined)
    const id = gerarId()
    expect(id).toMatch(/^id-/)
    expect(id.length).toBeGreaterThan(3)
  })

  it('não estoura se randomUUID lançar (Web Crypto bloqueado)', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('bloqueado')
      },
    })
    expect(gerarId()).toMatch(/^id-/)
  })

  it('gera valores distintos em chamadas repetidas', () => {
    const ids = new Set(Array.from({ length: 100 }, () => gerarId()))
    expect(ids.size).toBe(100)
  })
})
