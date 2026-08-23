/**
 * O conteúdo institucional do Club Cut que depende de fato, e não de design.
 *
 * Mesma regra do `CONTATO`: **campo sem valor real fica vazio e o bloco
 * correspondente da página `/sobre` não renderiza.** Nunca preencher com
 * marcador ("[seu nome]", "em breve", CNPJ de exemplo) para a página parecer
 * completa — uma página "sobre" com marcador no ar é pior do que não ter
 * página "sobre", porque ela é justamente a página que a pessoa abre para
 * conferir se tem gente de verdade atrás do produto.
 *
 * A `/sobre` foi feita para funcionar meia preenchida: a tese, as três
 * posições e o fechamento não dependem de nada daqui, porque descrevem
 * decisões que já estão no produto e qualquer um pode conferir.
 */

/** A história de origem, em parágrafos. */
export const ORIGEM = {
  /**
   * Um item por parágrafo, na ordem em que aconteceu.
   *
   * O que faz este bloco funcionar é especificidade: data, número pequeno e
   * **pelo menos um erro admitido**. "Nas duas primeiras semanas ele errava
   * quando o cliente escrevia 'depois do almoço'" compra mais confiança que
   * três parágrafos de missão. Evitar: revolucionar, empoderar, solução
   * completa, nossa paixão — são as palavras que fazem o texto parecer
   * gerado.
   */
  paragrafos: [] as string[],

  /**
   * Imagem de AMBIENTE — interior de barbearia, bancada, cadeira, luz.
   * Nunca rosto de pessoa atribuído a um nome: ambiente ninguém audita,
   * pessoa sim. `largura`/`altura` são obrigatórias para a página não pular
   * quando a imagem carrega.
   */
  imagem: null as null | {
    src: string
    alt: string
    largura: number
    altura: number
    legenda?: string
  },
}

/**
 * Quem faz o produto.
 *
 * Em ordem de força: foto real (mesmo de celular) > sem foto, com nome e link
 * que dá para conferir > foto gerada. A terceira é a única que pode custar
 * mais do que entrega: quem desconfia do retrato passa a desconfiar dos
 * depoimentos junto.
 *
 * Se o Club Cut é uma pessoa só, dizer que é uma pessoa só. Inventar um time
 * de cinco transmite menos solidez que assumir o tamanho.
 */
export const QUEM_FAZ = null as null | {
  nome: string
  /** O que a pessoa faz no dia a dia, não o cargo bonito. */
  papel: string
  bio: string
  /** Perfis públicos que qualquer um pode abrir e conferir. */
  links: Array<{ href: string; rotulo: string }>
  foto: null | { src: string; alt: string }
}

/** Dados da empresa. É o que separa "empresa" de "landing page". */
export const EMPRESA = {
  razaoSocial: null as string | null,
  /** Formatado como se lê: '00.000.000/0001-00'. */
  cnpj: '67.127.614/0001-00' as string | null,
  cidade: null as string | null,
}
