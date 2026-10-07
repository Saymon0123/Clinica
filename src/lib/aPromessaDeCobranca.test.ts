import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A promessa pública de cobrança, amarrada à regra que cobra de verdade.
 *
 * ## Por que este arquivo existe
 *
 * Em 07/10 a migration 0217 passou a cobrar a remarcação pedida pelo cliente
 * no WhatsApp. Dois textos públicos diziam o contrário, e um deles eram os
 * **Termos de Uso**: "Remarcar um horário já criado não gera nova cobrança".
 * Por um momento o banco cobrou o que o contrato prometia de graça.
 *
 * Deu em nada porque não havia fatura emitida nenhuma — mas o que salvou foi
 * sorte de cronograma, não processo. A migration foi mapeada como mudança de
 * Supabase; ninguém procurou a frase no CRM, e ela estava em duas telas.
 *
 * O teste não consegue ler o banco (o runner não tem `.env`, e teste de
 * unidade aqui importa de módulo puro). O que ele consegue, e é o que falta,
 * é **impedir a frase de voltar**: lê as duas telas como texto, no mesmo
 * padrão do tripwire de `ErroDeCarga.test.ts`.
 *
 * Se esta suíte reclamar, a saída é conferir qual lado mudou — a regra no
 * banco ou o texto na tela — e acertar o texto. Nunca afrouxar o teste.
 */

function fonte(arquivo: string) {
  return readFileSync(new URL(arquivo, import.meta.url), 'utf-8')
}

/** Extrai o array literal de um `const NOME = [ ... ]` como lista de strings. */
function itensDaLista(texto: string, nome: string): string[] {
  const bloco = new RegExp(`const ${nome} = \\[([\\s\\S]*?)\\n\\]`).exec(texto)
  if (!bloco) throw new Error(`não achei a lista ${nome} — ela foi renomeada?`)
  return [...bloco[1].matchAll(/'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2])
}

describe('a promessa pública de cobrança', () => {
  const vendas = fonte('../features/site/VendasPage.tsx')
  const termos = fonte('../features/legal/TermosPage.tsx')

  it('a página de venda NÃO lista remarcação entre o que não é cobrado', () => {
    // Esta lista são promessas em branco: o que está aqui é de graça, sem
    // ressalva. A remarcação pelo WhatsApp passou a ser cobrada, então ela
    // não cabe mais aqui -- a nuance (balcão continua de graça) mora no texto
    // corrido dos Termos, não numa lista de uma linha.
    const naoConta = itensDaLista(vendas, 'O_QUE_NAO_CONTA')
    expect(naoConta.length).toBeGreaterThan(0)
    expect(naoConta.filter((item) => /remarca/i.test(item))).toEqual([])
  })

  it('a página de venda diz que a remarcação pelo WhatsApp conta', () => {
    // O lado positivo da mesma moeda: tirar da lista errada não basta, porque
    // o leitor que não vê a remarcação em lugar nenhum assume que é de graça.
    const conta = itensDaLista(vendas, 'O_QUE_CONTA')
    expect(conta.some((item) => /remarca/i.test(item) && /whatsapp/i.test(item))).toBe(true)
  })

  it('os Termos de Uso tratam da remarcação, e sem a frase velha', () => {
    // A frase exata que ficou errada em 07/10. Ela não pode voltar: é
    // cláusula de contrato, e cobrar contra ela não é inconsistência de
    // texto, é problema de consumidor.
    expect(termos).not.toContain('não gera nova cobrança')
    expect(termos).toMatch(/remarcação/i)
  })

  it('os Termos continuam prometendo lembrete e reativação sem custo', () => {
    // Esta promessa SEGUE verdadeira na 0217: `gerar_fatura_de_uso` conta
    // lembrete e reativação como métrica (`v_lembretes`, `v_reativacoes`),
    // nunca como valor. Fica guardada para não cair por tabela junto com a
    // linha vizinha, numa próxima mexida na seção de preço.
    expect(termos).toContain('não têm custo')
  })
})
