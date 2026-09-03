import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroDeCarga } from './ErroDeCarga'

/**
 * O terceiro estado das listas (achado 31 da revisão de 01/09): carregando,
 * vazio e erro não podem se parecer. O banner é testado aqui como componente;
 * o último bloco é o tripwire das cinco telas — cada uma precisa calar o vazio
 * e o total sob erro, e isso se perde num refactor sem ninguém notar.
 *
 * Sem JSX (o vitest só inclui .test.ts): `createElement` faz o mesmo.
 */

// React 19 pede a flag para `act` não avisar que está fora de ambiente de teste.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let raiz: Root
let host: HTMLDivElement

function montar(props: Parameters<typeof ErroDeCarga>[0]) {
  act(() => {
    raiz.render(createElement(ErroDeCarga, props))
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  raiz = createRoot(host)
})

afterEach(() => {
  act(() => {
    raiz.unmount()
  })
  host.remove()
})

describe('ErroDeCarga', () => {
  it('sem mensagem não ocupa lugar nenhum', () => {
    montar({ mensagem: null, aoTentarDeNovo: vi.fn() })
    expect(host.innerHTML).toBe('')
  })

  it('com mensagem é um alerta com o caminho de volta', () => {
    montar({ mensagem: 'Não foi possível carregar os clientes.', aoTentarDeNovo: vi.fn() })
    const alerta = host.querySelector('[role="alert"]')
    expect(alerta?.textContent).toContain('Não foi possível carregar os clientes.')
    expect(alerta?.textContent).toContain('Seus dados estão salvos')
    expect(host.querySelector('button')?.textContent).toContain('Tentar de novo')
  })

  it('"tentar de novo" chama o reload do hook', () => {
    const reload = vi.fn()
    montar({ mensagem: 'Falhou.', aoTentarDeNovo: reload })
    act(() => {
      host.querySelector('button')!.click()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('enquanto tenta, o botão trava para não empilhar consultas', () => {
    const reload = vi.fn()
    montar({ mensagem: 'Falhou.', aoTentarDeNovo: reload, tentando: true })
    const botao = host.querySelector('button')!
    expect(botao.disabled).toBe(true)
    expect(botao.textContent).toContain('Tentando')
    act(() => {
      botao.click()
    })
    expect(reload).not.toHaveBeenCalled()
  })
})

/**
 * Tripwire: sob erro, nenhuma das cinco telas pode afirmar "nenhum cliente",
 * "nenhum produto" ou "R$ 0,00". Cada entrada é o trecho que faz o gate — se
 * alguém trocar a condição, o teste quebra e a pessoa lê este comentário.
 */
const GATES: Record<string, string[]> = {
  '../features/clientes/ClientesPage.tsx': ['error && clients.length === 0 ? null :'],
  '../features/catalogo/CatalogoPage.tsx': [
    'servicesError && services.length === 0 ? null :',
    'pacotesError && pacotes.length === 0 ? null :',
    'productsError && products.length === 0 ? null :',
  ],
  '../features/financeiro/FinanceiroPage.tsx': [
    "error ? '—' : format === 'currency'",
    "error ? '—' : formatCurrency(data.revenueCurrent)",
    'error ? null : data.topServices.length === 0',
    'error ? null : data.commissions.length === 0',
  ],
  '../features/rede/RedePage.tsx': ["erro ? '—' : moeda(totalFaturamento)", 'erroProducao ? ('],
  '../features/assinatura/CobrancaDaRede.tsx': ['erroDeCarga ? ('],
}

describe('as cinco listas têm os três estados', () => {
  for (const [arquivo, gates] of Object.entries(GATES)) {
    it(`${arquivo.split('/').pop()} usa o banner e cala o vazio sob erro`, () => {
      const fonte = readFileSync(new URL(arquivo, import.meta.url), 'utf-8')
      expect(fonte).toContain("from '../../components/ErroDeCarga'")
      for (const gate of gates) expect(fonte).toContain(gate)
    })
  }
})
