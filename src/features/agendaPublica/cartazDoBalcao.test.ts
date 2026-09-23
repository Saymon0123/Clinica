import { describe, expect, it } from 'vitest'
import { tamanhoQueCabe } from './cartazDoBalcao'

/**
 * O cartaz é papel: não dá para consertar depois de impresso, e o erro só
 * aparece quando o dono já pagou a gráfica. O nome estourando a margem é o
 * jeito mais fácil de isso acontecer, porque quem testa usa "El Corte" — que
 * cabe em qualquer corpo — e nunca "Barbearia do Zé Studio Premium".
 */
describe('tamanhoQueCabe', () => {
  // Largura em milímetros no corpo 1, medida na helvetica bold do próprio
  // jsPDF — não estimada. A primeira versão deste teste chutou os números, o
  // nome comprido "cabia" em qualquer corpo e o teste reprovou código certo.
  const CURTO = 1.3476 // "El Corte"
  const COMPRIDO = 5.4539 // "Barbearia do Zé Studio Premium"
  const DISPONIVEL = 174 // 210 - 14*2 - 8

  it('usa o corpo máximo quando o nome é curto', () => {
    expect(
      tamanhoQueCabe({ larguraEm1: CURTO, larguraMax: DISPONIVEL, maximo: 34, minimo: 15 }),
    ).toBe(34)
  })

  it('encolhe o nome comprido até caber na largura', () => {
    const corpo = tamanhoQueCabe({
      larguraEm1: COMPRIDO,
      larguraMax: DISPONIVEL,
      maximo: 34,
      minimo: 15,
    })
    expect(corpo).toBeLessThan(34)
    // A prova que interessa: no corpo escolhido, o texto cabe.
    expect(COMPRIDO * corpo).toBeLessThanOrEqual(DISPONIVEL)
  })

  it('não encolhe além do mínimo legível, mesmo num nome absurdo', () => {
    // Estourar a margem é ruim; um nome de 2 pt é pior, porque o cartaz sai da
    // gráfica parecendo defeito de impressão. Aqui a peça vaza de propósito, e
    // a decisão fica com quem escolheu o nome.
    expect(
      tamanhoQueCabe({ larguraEm1: 40, larguraMax: DISPONIVEL, maximo: 34, minimo: 15 }),
    ).toBe(15)
  })

  it('não divide por zero quando o nome é vazio', () => {
    // `salonName` pode chegar vazio antes do contexto carregar. Sem esta
    // guarda vira Infinity, e o jsPDF desenha um corpo inválido em silêncio.
    expect(
      tamanhoQueCabe({ larguraEm1: 0, larguraMax: DISPONIVEL, maximo: 34, minimo: 15 }),
    ).toBe(34)
  })
})
