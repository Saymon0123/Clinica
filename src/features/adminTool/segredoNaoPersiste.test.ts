import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A senha do painel administrativo não pode voltar para o navegador.
 *
 * Até 12/09/2026 ela era gravada em texto claro no `sessionStorage`, para o
 * painel continuar destravado depois de recarregar a página. O CodeQL acusou na
 * primeira vez que rodou (`js/clear-text-storage-of-sensitive-data`), e o
 * achado era real: `/admin/nova-barbearia` é uma rota **pública**, e o
 * `sessionStorage` pertence à ORIGEM inteira — um XSS em qualquer página do
 * CRM, na mesma aba, lia a senha que libera criar barbearia.
 *
 * Este teste é a catraca. Lê os arquivos como texto, e não o comportamento,
 * porque o alvo é uma linha que ninguém escreve por mal: alguém vai achar
 * ruim ter que digitar a senha de novo depois de um F5, e a correção "óbvia" é
 * exatamente a que abriu o buraco. Se a conveniência fizer falta, o caminho é
 * um token curto e assinado devolvido pelo `verify` — nunca a senha crua.
 */
const raiz = process.cwd()
const PASTA = 'src/features/adminTool'
const ler = (p: string) => readFileSync(path.join(raiz, p), 'utf8')

const arquivosDoPainel = readdirSync(path.join(raiz, PASTA))
  .filter((nome) => /\.tsx?$/.test(nome) && !nome.endsWith('.test.ts'))
  .map((nome) => `${PASTA}/${nome}`)

describe('a senha administrativa nunca é persistida', () => {
  it('nenhum arquivo do painel grava coisa nenhuma em storage', () => {
    // Deliberadamente amplo: não é "não grave a senha", é "não grave NADA".
    // Nesta pasta tudo que existe gira em torno do segredo, então qualquer
    // `setItem` aqui merece uma conversa antes de entrar.
    for (const arquivo of arquivosDoPainel) {
      expect.soft(ler(arquivo), `${arquivo} gravou em storage`).not.toMatch(
        /(session|local)Storage\s*\.\s*setItem/,
      )
    }
  })

  it('o painel apaga a senha que as versoes antigas deixaram gravada', () => {
    // Sem isto, quem usou o painel antes da correção continuaria com a senha em
    // texto claro na aba até fechá-la — a correção não alcançaria quem já tinha
    // sido exposto.
    const pagina = ler(`${PASTA}/NovaBarbeariaPage.tsx`)
    expect(pagina).toMatch(/sessionStorage\s*\.\s*removeItem\(\s*CHAVE_ANTIGA\s*\)/)
    expect(pagina).toMatch(/const CHAVE_ANTIGA = 'admin_tool_secret'/)
  })

  it('nenhuma tela do CRM guarda uma variavel chamada secret', () => {
    // A busca larga: o buraco pode reaparecer fora desta pasta.
    const telas: string[] = []
    const varrer = (dir: string) => {
      for (const item of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const caminho = `${dir}/${item.name}`
        if (item.isDirectory()) varrer(caminho)
        else if (/\.tsx?$/.test(item.name) && !item.name.endsWith('.test.ts')) telas.push(caminho)
      }
    }
    varrer('src')

    for (const tela of telas) {
      expect.soft(ler(tela), `${tela} guardou um 'secret' em storage`).not.toMatch(
        /(session|local)Storage\s*\.\s*setItem\s*\([^)]*,\s*secret\b/,
      )
    }
  })

  it('a tranca de verdade continua sendo o servidor', () => {
    // A âncora. Este portão é só conveniência: o que protege é o edge conferir
    // o header a cada chamada. Se ISTO sumir, o resto do teste perde o sentido
    // e a discussão é outra, bem maior.
    const pagina = ler(`${PASTA}/NovaBarbeariaPage.tsx`)
    expect(pagina).toMatch(/'x-admin-secret':\s*secret/)
    expect(pagina).toMatch(/body:\s*\{\s*action:\s*'verify'\s*\}/)
  })
})
