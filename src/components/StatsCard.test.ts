import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { alturaDaBarra } from './alturaDaBarra'
import { StatsCard } from './StatsCard'

/**
 * O mini-gráfico dos cards do Financeiro.
 *
 * **O primeiro bloco é o que importa.** Até 05/10 toda barra tinha piso de 6%,
 * zero inclusive — e 6% de uma faixa de 36px são 2px. Uma sequência de dias
 * zerados virava um tracejado rente ao fundo do card, que o dono leu como
 * defeito de renderização. E o piso apagava a diferença entre "ninguém veio"
 * e "veio um": 1 de 40 é 2,5%, então os dois desenhavam a mesma coisa.
 *
 * A asserção que não pode cair é a de que zero e pouco desenham DIFERENTE.
 * Qualquer piso aplicado ao zero a derruba — inclusive um reintroduzido de boa
 * fé, para "a barra não sumir".
 *
 * Sem JSX (o vitest só inclui .test.ts): `createElement` faz o mesmo.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** jsdom não tem IntersectionObserver, e sem ele o card nunca fica "visível" —
 *  as barras ficariam todas em 0% e o teste passaria por engano. */
class ObservadorQueSempreVe {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  // Campo declarado e atribuído à mão: o `erasableSyntaxOnly` do tsconfig
  // proíbe propriedade de parâmetro no construtor.
  private readonly cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe() {
    this.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

let raiz: Root
let host: HTMLDivElement

function montar(props: Parameters<typeof StatsCard>[0]) {
  act(() => {
    raiz.render(createElement(StatsCard, props))
  })
}

const BASE: Parameters<typeof StatsCard>[0] = {
  icon: null,
  label: 'Agendamentos',
  value: 86,
  formattedValue: (n) => Math.round(n).toString(),
  bars: [],
}

beforeEach(() => {
  globalThis.IntersectionObserver = ObservadorQueSempreVe as unknown as typeof IntersectionObserver
  // A contagem animada dispara setState fora do `act`. Ela não é o assunto
  // aqui, e sem o rAF o teste para de depender do relógio.
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame
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

function alturas() {
  return [...host.querySelectorAll<HTMLElement>('.h-9 > div > div')].map((b) => b.style.height)
}

describe('a altura da barra', () => {
  it('não desenha nada no dia zerado', () => {
    expect(alturaDaBarra(0, 40)).toBe('0%')
  })

  it('garante o piso para o dia de pouco movimento', () => {
    expect(alturaDaBarra(1, 40)).toBe('8%')
  })

  it('usa a faixa inteira no maior dia', () => {
    expect(alturaDaBarra(40, 40)).toBe('100%')
  })

  it('NUNCA desenha o dia sem nada igual ao dia com pouco', () => {
    expect(alturaDaBarra(0, 40)).not.toBe(alturaDaBarra(1, 40))
  })
})

describe('o card', () => {
  it('deixa o dia zerado em branco e levanta só os que tiveram movimento', () => {
    montar({
      ...BASE,
      bars: [
        { label: '01/10', value: 30 },
        { label: '02/10', value: 0 },
        { label: '03/10', value: 15 },
        { label: '04/10', value: 0, highlight: true },
      ],
    })
    expect(alturas()).toEqual(['100%', '0%', '50%', '0%'])
  })

  it('apoia as barras numa linha de base, senão o zero não se lê como zero', () => {
    montar({ ...BASE, bars: [{ label: '01/10', value: 3 }] })
    const faixa = host.querySelector('.h-9')
    expect(faixa?.className).toContain('border-border-strong')
  })

  it('não deixa linha de base solta no card sem gráfico', () => {
    montar({ ...BASE, bars: [] })
    const faixa = host.querySelector('.h-9')
    expect(faixa?.className).toContain('border-transparent')
    expect(faixa?.className).not.toContain('border-border-strong')
  })

  it('aperta o vão quando o mês cresce, senão 31 barras viram um pente', () => {
    const mes = Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }))
    montar({ ...BASE, bars: mes })
    expect(host.querySelector('.h-9')?.className).toContain('gap-0.5')

    montar({ ...BASE, bars: mes.slice(0, 7) })
    expect(host.querySelector('.h-9')?.className).toContain('gap-1')
  })

  it('diz as duas pontas do eixo — sem elas o desenho não diz de quando é', () => {
    montar({ ...BASE, bars: [{ label: '01/10', value: 3 }], eixo: ['1 out', 'hoje'] })
    expect(host.textContent).toContain('1 out')
    expect(host.textContent).toContain('hoje')
  })

  it('guarda o espaço do eixo mesmo sem gráfico, para a fileira não desalinhar', () => {
    montar({ ...BASE, bars: [] })
    // Duas pontas vazias: o card de comissão do barbeiro não tem série, e sem
    // esta linha ele ficaria mais baixo que os três ao lado.
    expect(host.querySelectorAll('.text-\\[11px\\] > span')).toHaveLength(2)
  })

  it('escreve o dia e o valor no balão de cada barra', () => {
    montar({ ...BASE, bars: [{ label: '03/10', value: 28 }] })
    expect(host.querySelector('.h-9 > div > div')?.getAttribute('title')).toBe('03/10 · 28')
  })
})
