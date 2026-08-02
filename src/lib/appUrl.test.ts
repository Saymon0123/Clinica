import { afterEach, describe, expect, it, vi } from 'vitest'

// APP_URL é resolvido no import do módulo, então cada caso reimporta com o
// ambiente já ajustado.
async function carregar(appUrl?: string) {
  vi.resetModules()
  if (appUrl === undefined) {
    vi.stubEnv('VITE_APP_URL', '')
  } else {
    vi.stubEnv('VITE_APP_URL', appUrl)
  }
  return import('./appUrl')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('APP_URL', () => {
  it('usa VITE_APP_URL quando definida', async () => {
    const { APP_URL } = await carregar('https://crm.exemplo.com.br')
    expect(APP_URL).toBe('https://crm.exemplo.com.br')
  })

  it('remove barras finais', async () => {
    const { APP_URL } = await carregar('https://crm.exemplo.com.br///')
    expect(APP_URL).toBe('https://crm.exemplo.com.br')
  })

  it('ignora valor só com espaços e cai no origin atual', async () => {
    const { APP_URL } = await carregar('   ')
    expect(APP_URL).toBe(window.location.origin)
  })

  it('cai no origin atual quando a variável não está definida', async () => {
    const { APP_URL } = await carregar()
    expect(APP_URL).toBe(window.location.origin)
  })
})

describe('links que saem para fora', () => {
  it('monta o link de convite sobre o domínio configurado', async () => {
    const { urlDoConvite } = await carregar('https://crm.exemplo.com.br/')
    expect(urlDoConvite('abc123')).toBe('https://crm.exemplo.com.br/convite/abc123')
  })

  it('monta o link de redefinição de senha sobre o domínio configurado', async () => {
    const { urlDeRedefinicaoDeSenha } = await carregar('https://crm.exemplo.com.br')
    expect(urlDeRedefinicaoDeSenha()).toBe('https://crm.exemplo.com.br/redefinir-senha')
  })
})
