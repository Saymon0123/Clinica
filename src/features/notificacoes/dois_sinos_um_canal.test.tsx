// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, Fragment, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { NotificacoesProvider, useNotificacoesDoShell } from './NotificacoesContext'
import { useNotificacoes } from './useNotificacoes'

/**
 * O crash do primeiro cadastro pós-sino (Sentry REACT-NATIVE-7, 15/09).
 *
 * O AppLayout monta o sino DUAS vezes (cabeçalho do celular + rodapé da
 * sidebar), e cada um chamando `useNotificacoes` abria um canal realtime com
 * o MESMO nome. O supabase-js devolve o mesmo canal para o mesmo tópico; o
 * segundo `.on()` depois do `subscribe()` do primeiro LANÇA — e o error
 * boundary engolia o shell inteiro na primeira tela de quem acabava de criar
 * a barbearia.
 *
 * Duas defesas, cada uma com sua asserção:
 *   1. o provider roda o hook UMA vez para os dois sinos → um canal só;
 *   2. o nome do canal leva sufixo único por montagem → nem o uso duplo
 *      direto (o defeito original) colide no tópico.
 */

const canaisAbertos: string[] = []

vi.mock('../../lib/supabase', () => {
  function consulta(resultado: unknown) {
    const q: Record<string, unknown> = {}
    for (const metodo of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
      q[metodo] = () => q
    }
    // Thenable: `await` e `Promise.all` funcionam sem timers.
    q.then = (resolve: (v: unknown) => void) => resolve(resultado)
    return q
  }
  return {
    supabase: {
      channel: (nome: string) => {
        canaisAbertos.push(nome)
        const canal = { on: () => canal, subscribe: () => canal }
        return canal
      },
      removeChannel: () => {},
      from: () => consulta({ data: [], error: null }),
    },
  }
})

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'pessoa-1' } }),
}))

function renderizar(no: ReactNode) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(no)
  })
  act(() => {
    root.unmount()
  })
}

function SinoConsumidor() {
  useNotificacoesDoShell()
  return null
}

function SinoComHookProprio() {
  useNotificacoes('salao-1')
  return null
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  canaisAbertos.length = 0
})

describe('dois sinos, um canal', () => {
  it('o provider abre UM canal para os dois sinos do AppLayout', () => {
    renderizar(
      createElement(NotificacoesProvider, {
        salonId: 'salao-1',
        children: createElement(
          Fragment,
          null,
          createElement(SinoConsumidor),
          createElement(SinoConsumidor),
        ),
      }),
    )
    expect(canaisAbertos).toHaveLength(1)
  })

  it('sem salão, canal nenhum é aberto', () => {
    renderizar(
      createElement(NotificacoesProvider, {
        salonId: null,
        children: createElement(
          Fragment,
          null,
          createElement(SinoConsumidor),
          createElement(SinoConsumidor),
        ),
      }),
    )
    expect(canaisAbertos).toHaveLength(0)
  })

  it('mesmo o uso duplo direto do hook nao colide no nome do topico', () => {
    // O defeito original: dois hooks, mesmo salão. Com o sufixo por montagem,
    // são dois canais de nomes DIFERENTES — o supabase-js não devolve mais o
    // canal já assinado do vizinho. Se alguém remover o sufixo, os dois nomes
    // ficam iguais e esta asserção cai.
    renderizar(
      createElement(
        'div',
        null,
        createElement(SinoComHookProprio),
        createElement(SinoComHookProprio),
      ),
    )
    expect(canaisAbertos).toHaveLength(2)
    expect(canaisAbertos[0]).not.toBe(canaisAbertos[1])
    for (const nome of canaisAbertos) {
      expect(nome).toMatch(/^notificacoes_salao-1_/)
    }
  })
})
