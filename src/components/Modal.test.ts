import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MENSAGEM_DESCARTAR, Modal } from './Modal'

/**
 * O mecanismo que vale para os 21 modais do CRM (achado 32 da revisão de
 * 01/09): tocar fora, Esc e o X passam por um caminho só, que ignora enquanto
 * salva e pergunta quando há trabalho preenchido. Testado aqui, no
 * componente, porque cada tela só declara os dois booleanos — se o mecanismo
 * regredir, regride nas 21 de uma vez.
 *
 * Sem JSX (o vitest só inclui .test.ts): `createElement` faz o mesmo.
 */

// React 19 pede a flag para `act` não avisar que está fora de ambiente de teste.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let raiz: Root
let host: HTMLDivElement

function montar(props: Parameters<typeof Modal>[0]) {
  act(() => {
    raiz.render(createElement(Modal, props))
  })
}

function apertarEsc() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
}

function tocarNoVeu() {
  act(() => {
    host.querySelector<HTMLElement>('.modal-veu')!.click()
  })
}

function tocarNoPainel() {
  act(() => {
    host.querySelector<HTMLElement>('[role="dialog"]')!.click()
  })
}

function tocarNoX() {
  act(() => {
    host.querySelector<HTMLElement>('button[aria-label="Fechar"]')!.click()
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  raiz = createRoot(host)
})

afterEach(() => {
  act(() => raiz.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('Modal: fechar sem escolher', () => {
  it('sem trabalho preenchido, veu, Esc e X fecham direto', () => {
    const onClose = vi.fn()
    montar({ onClose, titulo: 'Teste', children: 'conteudo' })
    tocarNoVeu()
    apertarEsc()
    tocarNoX()
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('tocar dentro do painel nunca fecha', () => {
    const onClose = vi.fn()
    montar({ onClose, children: 'conteudo' })
    tocarNoPainel()
    expect(onClose).not.toHaveBeenCalled()
  })

  // Fechar no meio de um salvamento deixava a tela sem resposta e o dono
  // clicava de novo — e a comanda saía duas vezes.
  it('enquanto salva, nada fecha', () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    montar({ onClose, titulo: 'Teste', bloquearFechamento: true, confirmarFechamento: true, children: 'x' })
    tocarNoVeu()
    apertarEsc()
    tocarNoX()
    expect(onClose).not.toHaveBeenCalled()
    // Nem pergunta: perguntar "descartar?" no meio do salvamento seria pior.
    expect(confirm).not.toHaveBeenCalled()
  })

  it('com trabalho preenchido, pergunta antes -- e respeita o "nao"', () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    montar({ onClose, titulo: 'Teste', confirmarFechamento: true, children: 'x' })
    tocarNoVeu()
    apertarEsc()
    tocarNoX()
    expect(confirm).toHaveBeenCalledTimes(3)
    expect(confirm).toHaveBeenLastCalledWith(MENSAGEM_DESCARTAR)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('com trabalho preenchido, o "sim" fecha', () => {
    const onClose = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    montar({ onClose, confirmarFechamento: true, children: 'x' })
    tocarNoVeu()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a tela pode trocar a frase da pergunta', () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    montar({ onClose, confirmarFechamento: 'Descartar esta comanda?', children: 'x' })
    apertarEsc()
    expect(confirm).toHaveBeenCalledWith('Descartar esta comanda?')
  })

  // O listener de Esc é rearmado quando as props mudam: o modal que começa
  // vazio e ganha trabalho depois tem de passar a perguntar.
  it('passa a perguntar quando o trabalho aparece depois de aberto', () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    montar({ onClose, confirmarFechamento: false, children: 'x' })
    montar({ onClose, confirmarFechamento: true, children: 'x' })
    apertarEsc()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('destrava o scroll da pagina ao fechar', () => {
    const onClose = vi.fn()
    montar({ onClose, children: 'x' })
    expect(document.body.style.overflow).toBe('hidden')
    act(() => raiz.unmount())
    expect(document.body.style.overflow).toBe('')
    raiz = createRoot(host)
  })
})
