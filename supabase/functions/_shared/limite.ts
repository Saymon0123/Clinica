import type { ClienteAdmin } from './supabase.ts'

/**
 * O limitador de taxa — um só, com a política de falha declarada no lugar de
 * uso (achado M10).
 *
 * Eram **sete cópias** literais de `taxaExcedida` espalhadas pelas edges, e
 * mais cinco de `ipDe`. Ainda idênticas em 12/09/2026 — conferido por hash, só
 * a formatação da assinatura divergia em duas. Sete cópias é uma edição de
 * distância de deixarem de ser idênticas, e aí o limite de um caminho muda e o
 * do outro não, sem ninguém perceber.
 *
 * O OUTRO lado do M10: o limitador falhava **aberto** em todos os sete, por um
 * `if (error) return false` que ninguém escolheu caso a caso. "Deixa passar
 * quando o limitador quebra" é uma decisão legítima em algumas portas e
 * indefensável em outras — e a única forma de não ter a decisão errada por
 * omissão é não deixar omitir. Por isso `seFalhar` **não tem padrão**: quem
 * chama é obrigado a dizer.
 */
export type SeOLimitadorFalhar =
  /**
   * Passa. Para porta que o CLIENTE FINAL usa: se o limitador cair, travar
   * significa que a pessoa não consegue marcar horário, e o dono perde cliente
   * por causa de uma tabela nossa. O risco aceito está escrito aqui de
   * propósito — é uma escolha, não um esquecimento.
   */
  | 'deixa-passar'
  /**
   * Bloqueia. Para porta que guarda senha, dinheiro, ou um laço que custa caro:
   * ali o limitador fora do ar É o ataque. Travar é o comportamento certo,
   * mesmo incomodando quem é de casa.
   */
  | 'bloqueia'

/**
 * Devolve `true` quando a chave estourou o limite na janela — e aí quem chama
 * recusa a requisição.
 *
 * A contagem vive no banco (`taxa_excedida`, migration 0111), e não em memória,
 * porque cada requisição pode cair num isolate diferente: contador de processo
 * zera sozinho e o limite vira decoração.
 */
export async function taxaExcedida(
  admin: ClienteAdmin,
  chave: string,
  limite: number,
  janelaSegundos: number,
  seFalhar: SeOLimitadorFalhar,
): Promise<boolean> {
  const { data, error } = await admin.rpc('taxa_excedida', {
    p_chave: chave,
    p_limite: limite,
    p_janela_segundos: janelaSegundos,
  })
  if (error) {
    // A chave vai no log de propósito: sem ela não dá para saber QUAL porta
    // ficou desprotegida enquanto o limitador esteve fora.
    console.error(
      `Limitador de taxa indisponivel (chave=${chave}, politica=${seFalhar}):`,
      error,
    )
    return seFalhar === 'bloqueia'
  }
  return data === true
}

/**
 * O IP de quem chamou, na ordem em que os proxies da frente o repassam.
 *
 * `x-forwarded-for` pode vir com uma lista; o primeiro é o cliente original.
 * Nenhum destes cabeçalhos é confiável contra quem quer forjá-los — servem para
 * separar gente normal, não para barrar um atacante decidido. Quem precisa de
 * garantia de verdade usa chave de negócio (token do convite, id do salão,
 * telefone), e é o que as portas mais sensíveis já fazem.
 */
export function ipDe(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    // 'sem-ip' e nao outra coisa: e o valor que as cinco copias usavam, e a
    // string entra na CHAVE do limite. Trocar por 'desconhecido' zeraria todos
    // os contadores em voo e juntaria numa chave nova quem hoje esta separado
    // -- mudanca de comportamento disfarcada de limpeza.
    'sem-ip'
  )
}
