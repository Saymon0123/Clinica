import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

/**
 * O cabeçalho de página, e o motivo de este teste existir.
 *
 * A linha de fora já tinha `flex-wrap`, mas ela só deixava o BLOCO inteiro de
 * ações descer — dentro dele os botões continuavam numa fila rígida. No
 * Financeiro a fila é "Hoje · Este mês · Caixa · abre na 1ª venda · Exportar":
 * media 551px num celular de 375, e a PÁGINA ganhava 176px de rolagem lateral.
 *
 * Rolagem horizontal é o sintoma clássico de tela quebrada no telefone, e dez
 * páginas usam este componente — o conserto vale para todas, e a regressão
 * também valeria. Daí a catraca.
 *
 * **Isto não substitui medir numa moldura de verdade.** jsdom não tem motor de
 * layout: ele não sabe que 551 não cabe em 375. O que este teste prende é a
 * CLASSE; quem prova o pixel é a vistoria em 375px, registrada no backlog.
 *
 * Sem JSX (o vitest só inclui .test.ts): `createElement` faz o mesmo.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let raiz: Root
let host: HTMLDivElement

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

function montar(props: Parameters<typeof PageHeader>[0]) {
  act(() => {
    raiz.render(createElement(PageHeader, props))
  })
}

describe('o cabeçalho de página', () => {
  it('deixa as AÇÕES quebrarem linha — senão a página rola de lado no celular', () => {
    montar({
      titulo: 'Financeiro',
      subtitulo: 'Desempenho e vendas da sua barbearia',
      acoes: createElement('button', null, 'Exportar'),
    })
    // O PAI DIRETO do botão, não "o primeiro div que contém um botão": este
    // teste nasceu sem valer nada porque o seletor frouxo pegava a linha de
    // fora, que tem `flex-wrap` de qualquer jeito — e passava com o defeito de
    // pé. Só descobri tentando fazê-lo falhar.
    const caixaDasAcoes = host.querySelector('button')!.parentElement!
    expect(caixaDasAcoes.className).toContain('flex-wrap')
  })

  it('a linha de fora também quebra, para as ações caberem embaixo do título', () => {
    montar({ titulo: 'Financeiro', acoes: createElement('button', null, 'Exportar') })
    expect((host.firstElementChild as HTMLElement).className).toContain('flex-wrap')
  })

  it('sem ações, não desenha a caixa vazia', () => {
    montar({ titulo: 'Clientes' })
    expect(host.querySelectorAll('div').length).toBe(2) // a linha de fora e a do título
  })

  it('mostra título e subtítulo', () => {
    montar({ titulo: 'Agenda', subtitulo: 'As reservas do dia, por profissional' })
    expect(host.textContent).toContain('Agenda')
    expect(host.textContent).toContain('As reservas do dia, por profissional')
  })
})
