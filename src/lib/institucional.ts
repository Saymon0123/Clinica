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
  paragrafos: [
    'Tudo começou observando uma coisa que parecia pequena: barbeiros cortando cabelo enquanto dezenas de clientes mandavam "tem horário hoje?" no WhatsApp. Alguns esperavam. Alguns esqueciam. Alguns simplesmente iam para outra barbearia. A agenda não estava vazia porque faltavam clientes. Estava vazia porque ninguém conseguia atender todos eles.',
    'Foi aí que começamos a testar uma ideia: e se a barbearia pudesse ter alguém atendendo seus clientes 24 horas por dia? Não um chatbot daqueles que responde "Digite 1 para agendar", mas uma IA capaz de conversar, entender o que o cliente quer, encontrar o horário certo e colocar aquele cliente na agenda.',
    'A primeira versão foi longe demais. Em um dos primeiros testes, a Aura confirmou um horário errado. O barbeiro ficou irritado, e com razão. A gente poderia esconder essa história, mas foi justamente esse erro que mudou o produto. Percebemos que não estávamos construindo uma IA para "conversar". Estávamos construindo uma IA que precisava ser confiável o suficiente para mexer na agenda de um negócio real. Jogamos aquela versão fora e reconstruímos partes importantes da operação.',
    'Depois disso, a pergunta mudou. Não queríamos criar mais um sistema para a barbearia administrar. Queríamos criar algo que trabalhasse para a barbearia. Foi assim que nasceu a Aura: uma IA que atende, recupera oportunidades e transforma conversas em agendamentos, enquanto o barbeiro faz o que realmente importa: atender quem está na cadeira.',
    'E foi daí que veio nossa regra mais importante: se a Aura não gerar resultado, não faz sentido cobrar pelo software. Você não paga para usar a Aura. Você paga quando ela coloca um cliente na sua agenda.',
  ] as string[],

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
 * Dizer o tamanho que a empresa tem. Inventar um time de cinco transmite
 * menos solidez que assumir o tamanho real.
 */
export type Pessoa = {
  nome: string
  /** O que a pessoa faz, não o cargo bonito — mas o cargo serve enquanto for o
   *  que a pessoa usa para se apresentar. */
  papel: string
  /** Duas ou três linhas em primeira pessoa. Opcional: nome e papel já dizem
   *  quem é, e bio inventada é pior que bio ausente. */
  bio?: string
  /** Perfis públicos que qualquer um pode abrir e conferir. */
  links?: Array<{ href: string; rotulo: string }>
  /** Foto real. Sem ela o cartão continua de pé. */
  foto?: { src: string; alt: string }
}

export const QUEM_FAZ: Pessoa[] = [
  { nome: 'Samuel Rocha', papel: 'CEO' },
  { nome: 'Saymon Castro', papel: 'CTO e cofundador' },
]

/** Dados da empresa. É o que separa "empresa" de "landing page". */
export const EMPRESA = {
  razaoSocial: 'Aura Studio Ltda.' as string | null,
  /** Formatado como se lê: '00.000.000/0001-00'. */
  cnpj: '67.127.614/0001-00' as string | null,
  cidade: 'Curitiba, PR' as string | null,
}
