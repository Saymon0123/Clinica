import { somenteDigitos } from './telefone.ts'

/**
 * O número pronto para o WhatsApp — `55` + DDD + número, só dígitos.
 *
 * POR QUE ELE EXISTE. O número era montado em CINCO lugares, cada um com uma
 * regra diferente, e nenhum deles sabia do nono dígito:
 *
 *   src/lib/telefone.ts        poe 55 quando tem 10-11 digitos e valida 12-13
 *   agenda-publica (aqui)      tirava o 55 e recolocava, sem validar nada
 *   no do n8n                  '55' + digitos, incondicional -> gera 5555...
 *
 * O NONO DÍGITO. Celular no Brasil é DDD + 9 + 8 dígitos, mas quem cadastra
 * digita como decorou — e muita gente decorou antes de 2016, sem o 9. O
 * telefone da El Guardians está assim: `(41) 9847-2975`, dez dígitos. O
 * `wa.me` montado com ele não abre conversa nenhuma, e ninguém percebeu porque
 * o botão "Falar com a barbearia" aparece normalmente; só não leva a lugar
 * algum.
 *
 * COMO SE SABE QUE FALTA. Depois do DDD, um celular antigo tem 8 dígitos
 * começando em 6, 7, 8 ou 9. Fixo começa em 2, 3, 4 ou 5. É a faixa da
 * Anatel, e é o que separa "faltou o 9" de "é um fixo mesmo".
 *
 * FIXO NÃO GANHA O 9, de propósito. WhatsApp Business roda em número fixo, e
 * inventar um dígito ali quebraria justamente quem cadastrou certo.
 *
 * O QUE NÃO MUDA: `telefone_norm` no banco continua sendo os últimos 8 dígitos,
 * e isso é imune ao nono — `4198472975` e `5541998472975` terminam nos mesmos
 * oito. A busca e a deduplicação nunca dependeram desta função; só o link de
 * saída dependia.
 */
export function numeroParaWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = somenteDigitos(telefone)
  if (!digitos) return null

  // Tira o DDI para raciocinar sempre sobre o número local. Só quando o que
  // sobra tem cara de local: `5511...` com 13 dígitos é DDI + celular, mas
  // `5533445566` com 10 é um fixo de Campinas cujo DDD começa com 55.
  let local = digitos
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    local = digitos.slice(2)
  }

  if (local.length === 11) return `55${local}`

  if (local.length === 10) {
    const resto = local.slice(2)
    // 6 a 9: celular antigo, faltando o nono dígito. 2 a 5: fixo, fica como está.
    if (/^[6-9]/.test(resto)) return `55${local.slice(0, 2)}9${resto}`
    return `55${local}`
  }

  return null
}

/** O link da conversa, ou null quando o número não serve para o WhatsApp. */
export function linkWhatsApp(telefone: string | null | undefined): string | null {
  const numero = numeroParaWhatsApp(telefone)
  return numero ? `https://wa.me/${numero}` : null
}
