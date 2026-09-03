import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Sistema visual: um dialeto só (D2 a D5 da revisão de 01/09).
 *
 * Três regras que o CSS não consegue impor sozinho, então o teste impõe:
 *
 * 1. Nunca `text-white`/`text-black` cru sobre fundo de token no app — no
 *    tema escuro os tokens invertem e o branco vira o texto menos legível da
 *    tela (D2). Cada fundo sólido tem o seu `-foreground`.
 * 2. Cor destrutiva é estado de repouso, não de hover (D3): no celular hover
 *    não existe, e "Desativar" ficava idêntico a "Comissão".
 * 3. Botão sem classe do sistema é uma catraca (D5): cada tela tem um teto
 *    igual ao número que existia quando esta regra nasceu, e o número só pode
 *    descer. Não é zero — abas, seletores de período e ícones de fechar ainda
 *    são feitos à mão — mas ninguém cria dialeto novo sem o teste reclamar.
 *
 * Sem JSX aqui: o teste lê os arquivos como texto.
 */

// process.cwd(): o vitest roda na raiz do projeto, e `import.meta.url` aqui
// chega como caminho /@fs/ do Vite, que não é URL de arquivo.
const RAIZ = process.cwd()

function ler(relativo: string) {
  return readFileSync(join(RAIZ, relativo), 'utf-8')
}

/** Tags `<button ...>` lendo chaves, para o `>` de `onClick={() => …}` não encerrar a tag. */
export function tagsDeBotao(fonte: string): string[] {
  const tags: string[] = []
  let i = 0
  for (;;) {
    i = fonte.indexOf('<button', i)
    if (i < 0) break
    let j = i + 7
    let profundidade = 0
    while (j < fonte.length) {
      const c = fonte[j]
      if (c === '{') profundidade += 1
      else if (c === '}') profundidade -= 1
      else if (c === '>' && profundidade === 0) break
      j += 1
    }
    tags.push(fonte.slice(i, j + 1))
    i = j + 1
  }
  return tags
}

/** Arquivos .tsx do app (fora do site/landing, que tem direção de arte própria). */
function arquivosDoApp(): string[] {
  const saida: string[] = []
  function anda(dir: string) {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        if (nome === 'site') continue
        anda(caminho)
      } else if (nome.endsWith('.tsx')) {
        saida.push(caminho)
      }
    }
  }
  anda(join(RAIZ, 'src/components'))
  anda(join(RAIZ, 'src/features'))
  return saida
}

describe('sistema visual: um dialeto só', () => {
  it('nenhum text-white/text-black cru sobre fundo de token no app (D2)', () => {
    const culpados = arquivosDoApp().filter((a) => /\btext-(white|black)\b/.test(readFileSync(a, 'utf-8')))
    expect(culpados).toEqual([])
  })

  it('cor destrutiva é repouso, não hover (D3)', () => {
    const culpados = arquivosDoApp().filter((a) =>
      readFileSync(a, 'utf-8').includes('text-muted-foreground hover:text-danger'),
    )
    expect(culpados).toEqual([])
  })

  it('as classes do sistema existem completas no index.css (D5)', () => {
    const css = ler('src/index.css')
    expect(css).toContain('--danger-foreground')
    expect(css).toContain('--color-danger-foreground')
    expect(css).toMatch(/@layer components \{[\s\S]*\.btn-primary,[\s\S]*display: inline-flex/)
    expect(css).toMatch(/@media \(pointer: coarse\) \{[\s\S]*min-height: 2\.75rem/)
    expect(css).toMatch(/\.btn-primary:disabled \{[^}]*opacity: 0\.5/)
  })
})

/** Teto por tela, medido em 03/09/2026. Só pode descer. */
const TETO: Record<string, number> = {
  'src/features/agenda/AgendaPage.tsx': 6,
  'src/features/agenda/AppointmentDetailModal.tsx': 3,
  'src/features/agenda/NewAppointmentModal.tsx': 1,
  'src/features/financeiro/FinanceiroPage.tsx': 10,
  'src/features/clientes/ClientesPage.tsx': 4,
  'src/features/catalogo/CatalogoPage.tsx': 0,
  'src/features/equipe/EquipePage.tsx': 10,
  'src/features/conexao/ConexaoPage.tsx': 1,
  'src/features/rede/RedePage.tsx': 2,
  'src/features/vendas/NewSaleModal.tsx': 2,
  'src/features/vendas/VendasSection.tsx': 0,
  'src/features/configuracoes/ConfiguracoesPage.tsx': 1,
  'src/components/AppLayout.tsx': 2,
}

describe('botões fora do sistema visual são uma catraca (D5)', () => {
  for (const [arquivo, teto] of Object.entries(TETO)) {
    it(`${arquivo.split('/').pop()} não ganha botão novo sem classe do sistema (teto ${teto})`, () => {
      const semClasse = tagsDeBotao(ler(arquivo)).filter((tag) => !tag.includes('btn-'))
      expect(semClasse.length).toBeLessThanOrEqual(teto)
    })
  }
})
