export type Retangulo = { top: number; left: number; width: number; height: number }
export type Tamanho = { largura: number; altura: number }
export type Colocacao = { top: number; left: number; lado: 'acima' | 'abaixo' }

/** Respiro entre o elemento destacado e o balão, e das bordas da tela. */
const MARGEM = 12

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.max(minimo, Math.min(valor, maximo))
}

/**
 * Decide onde o balão cabe em relação ao elemento destacado.
 *
 * Preferimos **abaixo**, que é como o olho espera ler (elemento → explicação).
 * Só sobe quando não há espaço embaixo e há em cima — e, se não couber em
 * lugar nenhum, fica abaixo mesmo, preso à borda: um balão parcialmente
 * visível ainda comunica, um balão fora da tela não.
 *
 * O eixo horizontal centraliza no alvo e depois é preso à janela, senão um
 * elemento no canto joga metade do balão para fora.
 */
export function calcularPosicao(
  alvo: Retangulo,
  balao: Tamanho,
  janela: Tamanho,
): Colocacao {
  const espacoAbaixo = janela.altura - (alvo.top + alvo.height)
  const espacoAcima = alvo.top

  const cabeAbaixo = espacoAbaixo >= balao.altura + MARGEM
  const cabeAcima = espacoAcima >= balao.altura + MARGEM

  const lado: Colocacao['lado'] = cabeAbaixo || !cabeAcima ? 'abaixo' : 'acima'

  const topBruto =
    lado === 'abaixo' ? alvo.top + alvo.height + MARGEM : alvo.top - balao.altura - MARGEM

  const leftBruto = alvo.left + alvo.width / 2 - balao.largura / 2

  return {
    lado,
    top: limitar(topBruto, MARGEM, Math.max(MARGEM, janela.altura - balao.altura - MARGEM)),
    left: limitar(leftBruto, MARGEM, Math.max(MARGEM, janela.largura - balao.largura - MARGEM)),
  }
}
