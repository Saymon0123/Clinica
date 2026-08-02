import { describe, expect, it } from 'vitest'
import fonteConexao from '../conexao/ConexaoPage.tsx?raw'
import { PASSOS_CONEXAO } from './passos'

/**
 * Tour aponta para elementos da tela, e é do tipo de coisa que **quebra em
 * silêncio**: quem renomeia uma `div` não vê que existia um passo apontando
 * para ela, e o balão simplesmente some sem erro nenhum.
 *
 * Este teste lê o arquivo da tela e confere que toda âncora citada existe. É
 * grosseiro de propósito — não precisa de DOM nem de render, roda em
 * milissegundos e falha na hora certa: no CI, antes de ir para produção.
 */
function ancorasEm(fonte: string): string[] {
  return [...fonte.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1])
}

describe('passos do tour', () => {
  it('toda ancora da Conexao existe na tela', () => {
    const naTela = ancorasEm(fonteConexao)
    for (const passo of PASSOS_CONEXAO) {
      expect(naTela, `âncora "${passo.ancora}" não existe em ConexaoPage.tsx`).toContain(passo.ancora)
    }
  })

  it('nao ha ancora repetida na mesma tela', () => {
    const naTela = ancorasEm(fonteConexao)
    expect(new Set(naTela).size).toBe(naTela.length)
  })

  // Acima de quatro passos vira aula, e aula se pula.
  it('nenhuma tela passa de quatro passos', () => {
    expect(PASSOS_CONEXAO.length).toBeLessThanOrEqual(4)
  })

  it('todo passo tem titulo e texto preenchidos', () => {
    for (const passo of PASSOS_CONEXAO) {
      expect(passo.titulo.trim().length).toBeGreaterThan(0)
      expect(passo.texto.trim().length).toBeGreaterThan(20)
    }
  })
})
