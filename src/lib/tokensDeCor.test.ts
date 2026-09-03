import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Toda classe `-soft` usada nas telas precisa de token nos DOIS temas.
 *
 * O defeito que isto pega já aconteceu e voltou (achado 28 da revisão de
 * 01/09 e o D1 do design): `bg-warning-soft` estava em sete avisos — o de
 * pacote com prejuízo entre eles — e `--warning-soft` não existia. O Tailwind
 * não reclama de classe sem token: ele simplesmente não gera nada, e o aviso
 * aparece sem fundo, como texto solto. Ninguém vê no código; só na tela, e só
 * quem estiver olhando para o tema certo.
 *
 * O teste lê o CSS de verdade e as telas de verdade: se alguém remover o token
 * de um tema, ou usar uma família `-soft` nova sem criá-la, o CI quebra aqui e
 * diz qual.
 */

const RAIZ = resolve(__dirname, '..')
const CSS = readFileSync(join(RAIZ, 'index.css'), 'utf8')

type Bloco = { cabecalho: string; corpo: string }

/**
 * Quebra o CSS em blocos de nível zero, sem se importar com o que há dentro:
 * um `@media` inteiro vira um bloco só, com o cabeçalho dizendo que é escuro.
 */
function blocosDeNivelZero(css: string): Bloco[] {
  const blocos: Bloco[] = []
  let profundidade = 0
  let inicioCabecalho = 0
  let inicioCorpo = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') {
      if (profundidade === 0) inicioCorpo = i + 1
      profundidade++
    } else if (c === '}') {
      profundidade--
      if (profundidade === 0) {
        // Só a ÚLTIMA linha antes do `{` é o seletor. O que vem antes dela é
        // o que ficou entre o bloco anterior e este: comentários e regras sem
        // corpo, como `@import` e `@custom-variant dark (...)`. Essa última
        // fazia o `:root` do tema claro parecer escuro só por citar "dark".
        const trecho = css.slice(inicioCabecalho, inicioCorpo - 1).replace(/\/\*[\s\S]*?\*\//g, '')
        const linhas = trecho.split(/;|\n/).map((l) => l.trim()).filter(Boolean)
        blocos.push({ cabecalho: linhas[linhas.length - 1] ?? '', corpo: css.slice(inicioCorpo, i) })
        inicioCabecalho = i + 1
      }
    }
  }
  return blocos
}

const blocos = blocosDeNivelZero(CSS)
// O escuro deste projeto é o bloco `.dark` (via `@custom-variant dark`); o
// teste também aceita `prefers-color-scheme: dark` e `[data-theme="dark"]`
// para não quebrar se a estratégia mudar.
const escuros = blocos.filter((b) => /dark/.test(b.cabecalho))
// O tema claro é o `:root` que carrega os tokens de cor — há outro `:root` no
// arquivo, só com curvas de animação, e ele não serve.
const claro = blocos.find(
  (b) => b.cabecalho === ':root' && !/dark/.test(b.cabecalho) && b.corpo.includes('--primary:'),
)
const tema = blocos.find((b) => b.cabecalho.startsWith('@theme'))

/** Arquivos de tela: tudo em src/ que não é teste nem saída do grafo. */
function arquivosDeTela(dir: string, lista: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'graphify-out' || nome === 'node_modules') continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      arquivosDeTela(caminho, lista)
    } else if (/\.(tsx|ts|css)$/.test(nome) && !/\.test\.ts$/.test(nome)) {
      lista.push(caminho)
    }
  }
  return lista
}

/** `bg-warning-soft`, `text-primary-soft`, `bg-primary-soft/30` -> família `warning-soft`... */
const PADRAO_DE_CLASSE =
  /(?:^|[\s"'`{(:])(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|accent|shadow)-([a-z]+(?:-[a-z]+)*-soft)(?:\/\d+)?(?=[\s"'`})\]:]|$)/g

function familiasSoftUsadas(): Map<string, string[]> {
  const usos = new Map<string, string[]>()
  for (const arquivo of arquivosDeTela(RAIZ)) {
    const texto = readFileSync(arquivo, 'utf8')
    for (const m of texto.matchAll(PADRAO_DE_CLASSE)) {
      const familia = m[1]
      const lista = usos.get(familia) ?? []
      if (!lista.includes(arquivo)) lista.push(arquivo)
      usos.set(familia, lista)
    }
  }
  return usos
}

describe('tokens de cor -soft', () => {
  const usos = familiasSoftUsadas()

  it('o CSS tem os tres blocos que o teste precisa enxergar', () => {
    expect(claro, 'bloco :root do tema claro').toBeDefined()
    expect(escuros.length, 'blocos do tema escuro').toBeGreaterThan(0)
    expect(tema, 'bloco @theme').toBeDefined()
  })

  // Sem isto o teste passaria em branco se a varredura quebrasse: uma regex
  // que não casa nada não encontra família nenhuma e "aprova" tudo.
  it('a varredura encontra as familias que sabidamente existem', () => {
    expect([...usos.keys()].sort()).toEqual(
      expect.arrayContaining(['primary-soft', 'success-soft', 'danger-soft']),
    )
  })

  it('toda familia -soft usada nas telas tem token no tema claro, no escuro e no @theme', () => {
    const faltando: string[] = []
    for (const [familia, arquivos] of usos) {
      const onde = arquivos.map((a) => a.replace(RAIZ, 'src')).join(', ')
      if (!claro?.corpo.includes(`--${familia}:`)) {
        faltando.push(`--${familia} nao existe no tema claro (usada em ${onde})`)
      }
      if (!escuros.some((b) => b.corpo.includes(`--${familia}:`))) {
        faltando.push(`--${familia} nao existe no tema escuro (usada em ${onde})`)
      }
      if (!tema?.corpo.includes(`--color-${familia}:`)) {
        faltando.push(`--color-${familia} nao esta no @theme, entao o Tailwind nao gera a classe (usada em ${onde})`)
      }
    }
    expect(faltando, faltando.join('\n')).toEqual([])
  })
})
