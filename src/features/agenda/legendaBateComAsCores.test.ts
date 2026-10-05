import { describe, expect, it } from 'vitest'

/**
 * A legenda tem de pintar as MESMAS cores que a grade.
 *
 * ## O que este teste existe para impedir
 *
 * Uma legenda é uma promessa: "o bloco dessa cor quer dizer isso". Se alguém
 * mudar a cor de um estado na grade e esquecer da legenda, ela passa a ensinar
 * errado — e é pior que não existir, porque o barbeiro confia nela em vez de
 * olhar. O defeito seria invisível no código (dois arquivos corretos em
 * separado) e silencioso na tela (as duas cores existem, só não combinam).
 *
 * Por isso a `LegendaDaAgenda` guarda as classes LITERAIS do `BLOCK_STYLES`, e
 * este teste confere as duas listas uma contra a outra.
 *
 * `opacity-*` é ignorado de propósito: o cancelado é desenhado a 60% na grade,
 * onde ele divide espaço com o que ainda vai acontecer, mas a amostra de 16px
 * da legenda a 60% ficaria quase invisível. É a única diferença permitida, e
 * está aqui escrita em vez de combinada.
 *
 * Lê a fonte pelo `import.meta.glob` do Vite: nos testes desta pasta o
 * `import.meta.url` não chega como `file://` e o `fs` recusa.
 */
const FONTES = import.meta.glob('./{AgendaPage,LegendaDaAgenda}.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function fonte(nome: string) {
  const achado = Object.entries(FONTES).find(([caminho]) => caminho.endsWith(nome))
  return achado?.[1] ?? ''
}

/** As classes de cor, normalizadas: sem opacidade e em ordem estável. */
function assinatura(classes: string) {
  return classes
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !/^opacity-/.test(c))
    .sort()
    .join(' ')
}

function containersDaGrade() {
  const texto = fonte('AgendaPage.tsx')
  const bloco = texto.slice(texto.indexOf('const BLOCK_STYLES'), texto.indexOf('function AppointmentBlock'))
  return [...bloco.matchAll(/container:\s*'([^']+)'/g)].map((m) => assinatura(m[1]))
}

function amostrasDaLegenda() {
  return [...fonte('LegendaDaAgenda.tsx').matchAll(/amostra:\s*'([^']+)'/g)].map((m) =>
    assinatura(m[1]),
  )
}

describe('a legenda pinta as mesmas cores da grade', () => {
  it('acha as duas fontes (senao o resto passaria vazio)', () => {
    expect(fonte('AgendaPage.tsx').length).toBeGreaterThan(1000)
    expect(fonte('LegendaDaAgenda.tsx').length).toBeGreaterThan(500)
  })

  it('a varredura encontra os dois lados -- senao o teste aprovaria tudo', () => {
    // Uma regex que não casa nada não acha divergência nenhuma e passa em
    // branco. É a mesma guarda que o `tokensDeCor.test.ts` tem.
    expect(containersDaGrade().length).toBeGreaterThanOrEqual(7)
    expect(amostrasDaLegenda().length).toBeGreaterThanOrEqual(7)
  })

  it('todo estado da grade aparece na legenda', () => {
    const naLegenda = new Set(amostrasDaLegenda())
    const faltando = containersDaGrade().filter((c) => !naLegenda.has(c))
    expect(faltando, 'estilos da grade sem amostra correspondente na legenda').toEqual([])
  })

  it('a legenda nao inventa cor que a grade nao usa', () => {
    const naGrade = new Set(containersDaGrade())
    const sobrando = amostrasDaLegenda().filter((a) => !naGrade.has(a))
    expect(sobrando, 'amostras da legenda que nenhum estado da grade pinta').toEqual([])
  })
})
