/**
 * Que coluna do arquivo vai para que campo — e, principalmente, **o que ficou
 * de fora**.
 *
 * ## Os dois defeitos que isto conserta
 *
 * 1. **O resto era descartado em silêncio.** A importação lia quatro colunas e
 *    jogava fora todas as outras sem dizer nada. O dono exporta do sistema
 *    antigo com Email, CPF, Endereço, Última visita e Total gasto, importa, vê
 *    "197 clientes importados" e acredita que veio tudo. Descobre meses depois,
 *    quando precisa do e-mail de alguém.
 *
 * 2. **O casamento era exato**, então `Nome Completo` não era reconhecido como
 *    nome — e a tela dizia "O arquivo precisa ter uma coluna Nome" para um
 *    arquivo que tem a coluna na cara. `Nome do Cliente`, `Telefone 1` e
 *    `Data Nascimento` caíam na mesma armadilha, e são justamente os títulos
 *    que um export de sistema de barbearia costuma trazer.
 *
 * ## Por que um conserta o outro
 *
 * Casar de forma generosa é arriscado sozinho: `Nome do barbeiro` viraria o
 * nome do cliente sem ninguém ver. O que torna a generosidade segura é **a tela
 * mostrar o que foi usado para quê**. Com o mapeamento à vista, palpite errado
 * do sistema é palpite que o dono corrige em dois segundos; sem a tela, seria
 * dado errado gravado para sempre.
 *
 * Por isso as duas coisas moram na mesma função, e não em duas: quem casar sem
 * mostrar reintroduz o risco.
 *
 * Módulo puro, sem import de `supabase`: é a regra do projeto para teste de
 * unidade (o client exige `.env` já no import, e o CI não tem `.env`).
 */

export type Campo = 'nome' | 'telefone' | 'aniversario' | 'observacao'

/**
 * Os títulos aceitos por campo, **em ordem de preferência**.
 *
 * A ordem decide quando a planilha tem dois candidatos: com `Telefone` e
 * `Celular` juntos, vale `Telefone` e `Celular` entra na lista de ignoradas —
 * onde o dono a vê, em vez de ela desaparecer.
 */
const CANDIDATOS: Record<Campo, readonly string[]> = {
  nome: ['nome', 'cliente', 'nome completo', 'nome do cliente', 'name'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel'],
  aniversario: ['aniversario', 'nascimento', 'data de nascimento', 'data nascimento'],
  observacao: ['observacao', 'observacoes', 'obs', 'notas', 'anotacoes'],
}

export const ROTULO_DO_CAMPO: Record<Campo, string> = {
  nome: 'Nome',
  telefone: 'Telefone',
  aniversario: 'Aniversário',
  observacao: 'Observação',
}

const CAMPOS = Object.keys(CANDIDATOS) as Campo[]

/** Minúscula, sem acento, sem espaço nas pontas: a forma de comparar títulos. */
export function normalizar(cabecalho: string): string {
  return cabecalho
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * O título COMEÇA com o candidato e acaba ali: `telefone 1` casa com
 * `telefone`; `nomeado` não casa com `nome`.
 *
 * Sem `RegExp` de propósito, e isto vale ficar escrito. A primeira versão
 * montava a expressão por template literal com um limite de palavra, que
 * precisava de escape DUPLO e ficou com um só — virou o caractere backspace, e
 * a passada inteira deixou de casar qualquer coisa. Treze testes passaram
 * verdes em cima de código morto, porque `Nome Completo` já casava na passada
 * EXATA e só `Telefone 1` exercitava esta. Comparação de string não tem escape
 * para errar.
 */
function comecaCom(cabecalho: string, candidato: string): boolean {
  if (!cabecalho.startsWith(candidato)) return false
  const seguinte = cabecalho.charAt(candidato.length)
  // Fim do título, ou um separador. Letra ou dígito significa outra palavra.
  return seguinte === '' || !/[a-z0-9]/.test(seguinte)
}

export type Mapeamento = {
  /** Índice da coluna de cada campo; -1 quando nenhuma serve. */
  indices: Record<Campo, number>
  /** O que foi usado para quê, na ordem dos campos. Alimenta a tela. */
  usadas: { campo: Campo; cabecalho: string }[]
  /** Títulos que ficaram de fora, na ordem do arquivo. Ditos pelo nome. */
  ignoradas: string[]
  /**
   * Colunas sem título — a vírgula sobrando no fim de cada linha do export.
   * Contadas e não nomeadas, porque "ignorei a coluna ''" não ajuda ninguém.
   */
  semTitulo: number
}

export function mapearColunas(headers: string[]): Mapeamento {
  const norm = headers.map(normalizar)
  const indices = { nome: -1, telefone: -1, aniversario: -1, observacao: -1 } as Record<Campo, number>
  // Uma coluna serve a um campo só: sem isto, `Observação` poderia ser
  // reivindicada duas vezes e a segunda leitura sobrescreveria a primeira.
  const tomadas = new Set<number>()

  // Primeira passada: título EXATO. Ela roda para todos os campos antes de
  // qualquer palpite, senão um palpite generoso de `nome` tomaria a coluna que
  // era exatamente o `telefone` de outro campo.
  for (const campo of CAMPOS) {
    for (const candidato of CANDIDATOS[campo]) {
      const i = norm.findIndex((h, idx) => h === candidato && !tomadas.has(idx))
      if (i !== -1) {
        indices[campo] = i
        tomadas.add(i)
        break
      }
    }
  }

  // Segunda passada, só para o que ficou sem nada: título que COMEÇA com o
  // candidato e termina ali. `Nome Completo` e `Telefone 1` entram;
  // `Sobrenome` não começa com o candidato e `Nomeado` continua com letra: os
  // dois ficam de fora, que é o certo. `includes` cru casaria com ambos.
  for (const campo of CAMPOS) {
    if (indices[campo] !== -1) continue
    for (const candidato of CANDIDATOS[campo]) {
      const i = norm.findIndex((h, idx) => !tomadas.has(idx) && comecaCom(h, candidato))
      if (i !== -1) {
        indices[campo] = i
        tomadas.add(i)
        break
      }
    }
  }

  const usadas = CAMPOS.filter((c) => indices[c] !== -1).map((campo) => ({
    campo,
    cabecalho: headers[indices[campo]].trim(),
  }))

  const ignoradas: string[] = []
  let semTitulo = 0
  headers.forEach((h, i) => {
    if (tomadas.has(i)) return
    if (h.trim() === '') semTitulo++
    else ignoradas.push(h.trim())
  })

  return { indices, usadas, ignoradas, semTitulo }
}
