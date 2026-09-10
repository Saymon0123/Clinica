/**
 * Reconhecer que a pessoa pediu para parar de receber.
 *
 * Mora em `_shared` porque é código puro, sem API do Deno: o `whatsapp-webhook`
 * importa daqui e o vitest testa daqui (`vitest.config.ts` inclui este diretório
 * de propósito). É a única forma de ter catraca sobre lógica de edge function
 * neste projeto.
 *
 * Por que isto existe: `clients.recusou_contato` nasceu na migration 0076 e é
 * LIDA por doze migrations. Escrita, por nenhuma linha — o botão "Nao quero
 * mais receber", aprovado pela Meta e já nos templates de reativação, caía num
 * `console.error`. A pessoa clicava e recebia de novo no ciclo seguinte.
 */

/**
 * Minúsculas, sem acento, sem pontuação no fim.
 *
 * O template aprovado traz "Nao quero mais receber" SEM acento (a Meta recebeu
 * assim); quem digita à mão escreve "não". Os dois têm que casar.
 */
export function normalizarTexto(t: string): string {
  return (
    t
      .normalize('NFD')
      // U+0300–U+036F: os acentos combinantes que o NFD acabou de separar das
      // letras. Escapes e não os caracteres literais, porque literais aqui são
      // INVISÍVEIS — se um editor os comer, isto vira `/[-]/` e para de tirar
      // acento em silêncio. `optOut.test.ts` é a catraca contra isso.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[.!]+$/, '')
  )
}

/**
 * As saídas que a pessoa pode escrever ou clicar.
 *
 * Comparação da MENSAGEM INTEIRA, nunca por pedaço. "cancelar" sozinho é
 * cancelamento de horário, não opt-out; "quero parar de fumar" não é pedido de
 * saída. Um falso positivo custa uma campanha a menos; um falso negativo é
 * continuar mandando para quem pediu para parar — e isso é LGPD, não UX.
 */
export const PALAVRAS_DE_SAIDA: readonly string[] = [
  'parar',
  'pare',
  'sair',
  'stop',
  'descadastrar',
  'nao quero mais receber',
  'nao quero receber',
  'nao quero mais mensagens',
  'nao quero mais mensagem',
]

const CONJUNTO = new Set(PALAVRAS_DE_SAIDA)

export function ehPedidoDeSaida(texto: string | null | undefined): boolean {
  if (!texto) return false
  return CONJUNTO.has(normalizarTexto(texto))
}
