import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A Central de Ajuda tem de falar dos botões que existem, com o nome que eles
 * têm hoje.
 *
 * Em 04/09/2026 a ajuda estava 45 commits atrás da tela: nove funcionalidades
 * sem tutorial nenhum e quatro tutoriais ensinando um caminho que não existia
 * mais — mandava digitar "estoque atual" num campo que virou "Estoque inicial",
 * e oferecia duas opções de exportação onde a tela tem três. O próprio arquivo
 * abre dizendo que o tutorial muda junto com a tela, no mesmo commit. A regra
 * estava escrita e não foi seguida, porque nada quebrava quando ela era
 * ignorada.
 *
 * Esta é a catraca que quebra. Para cada botão da lista, o rótulo precisa
 * existir NA TELA e NA AJUDA. Renomear o botão sem tocar no tutorial passa a
 * falhar aqui, apontando para os dois arquivos.
 *
 * O que ela NÃO faz: obrigar tutorial para funcionalidade nova — nenhum teste
 * sabe o que ainda não foi escrito. Ao criar uma tela, o par entra nesta lista
 * junto. É por isso que a lista é explícita e não varre o `src/` sozinha.
 */
const raiz = process.cwd()
const ler = (p: string) => readFileSync(path.join(raiz, p), 'utf8')
const AJUDA = ler('src/features/ajuda/AjudaPage.tsx').toLowerCase()

/** [o que a pessoa lê na tela, arquivo que desenha aquela tela] */
const PARES: [string, string][] = [
  ['Estornar venda', 'src/features/vendas/VendaDetalheModal.tsx'],
  ['Dividir pagamento', 'src/features/vendas/NewSaleModal.tsx'],
  ['Quero atender', 'src/features/equipe/EquipePage.tsx'],
  ['Renovar link', 'src/features/equipe/EquipePage.tsx'],
  ['Trocar e-mail', 'src/features/equipe/EquipePage.tsx'],
  ['Estoque inicial', 'src/features/catalogo/NewProductModal.tsx'],
  ['Ajuste de estoque', 'src/features/catalogo/NewProductModal.tsx'],
  ['Conversas', 'src/components/AppLayout.tsx'],
  ['Desativar o QR desta barbearia', 'src/features/agendaPublica/QrDoBalcao.tsx'],
  ['Conferir a gaveta', 'src/features/financeiro/CaixaSection.tsx'],
]

describe('a ajuda fala dos botões que existem', () => {
  it.each(PARES)('"%s" existe na tela e na ajuda', (rotulo, arquivoDaTela) => {
    const tela = ler(arquivoDaTela).toLowerCase()
    const alvo = rotulo.toLowerCase()

    // Primeiro a tela: se o rótulo sumiu dali, o problema é o par estar velho,
    // e a mensagem precisa dizer isso em vez de acusar a ajuda.
    expect(
      tela.includes(alvo),
      `"${rotulo}" nao esta mais em ${arquivoDaTela}. Se o botao foi renomeado, atualize o par E o tutorial.`,
    ).toBe(true)

    expect(
      AJUDA.includes(alvo),
      `"${rotulo}" existe na tela e a Central de Ajuda nao menciona. Escreva o tutorial no mesmo commit.`,
    ).toBe(true)
  })
})

describe('a ajuda nao ensina caminho que nao existe mais', () => {
  it('nao manda digitar "estoque atual" no cadastro de produto', () => {
    // O campo virou "Estoque inicial" ao criar e "Ajuste de estoque" ao editar
    // (passo 4.4). O texto antigo sobreviveu meses.
    expect(AJUDA).not.toMatch(/nome, pre[çc]o de venda, estoque atual/)
  })

  it('nao oferece so duas opcoes de exportacao', () => {
    // São três: Hoje, Esta semana e o mês da tela.
    expect(AJUDA).not.toMatch(/escolha \*\*esta semana\*\* ou \*\*este m[êe]s\*\*/)
  })
})
