/**
 * O telefone é gravado como cada canal digita: o balcão usa máscara, o agente
 * do WhatsApp usa 55DDDNÚMERO. Quem deduplica é o banco (telefone_norm, os
 * últimos 8 dígitos); aqui ficam as pontes de UI — busca por dígitos, exibição
 * amigável e o link direto para a conversa no WhatsApp.
 */

export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

/**
 * A régua do telefone — a MESMA que o banco aplica.
 *
 * De 10 dígitos (fixo com DDD) a 13 (DDI 55 + DDD + 9 dígitos), ignorando
 * máscara. Fora disso o cadastro não serve para nada: `telefone_norm` são os
 * últimos 8 dígitos, e um valor sem dígito nenhum vira norm nulo — o cliente
 * existe na lista e é invisível para lembrete, reativação e avaliação. Curto
 * é pior ainda: '9999' casa por sufixo com qualquer número terminado assim, e
 * a resposta de um cliente cai no cadastro de outro.
 *
 * Do lado do banco isto é a CHECK `clients_telefone_valido` e a função
 * `private.telefone_valido` (migration 0128), usada também por
 * `garantir_cliente`. Aqui é a mesma faixa, para o erro aparecer no campo em
 * vez de voltar como 23514 do servidor. Mudou num lado, muda no outro — os
 * dois têm teste com estes mesmos limites.
 */
export const TELEFONE_MIN_DIGITOS = 10
export const TELEFONE_MAX_DIGITOS = 13

/** Vazio é legítimo: cliente sem WhatsApp existe e continua entrando. */
export type EstadoDoTelefone = 'vazio' | 'valido' | 'invalido'

export function classificarTelefone(valor: string | null | undefined): EstadoDoTelefone {
  const bruto = (valor ?? '').trim()
  if (!bruto) return 'vazio'
  const digitos = somenteDigitos(bruto).length
  return digitos >= TELEFONE_MIN_DIGITOS && digitos <= TELEFONE_MAX_DIGITOS ? 'valido' : 'invalido'
}

/**
 * A frase do formato, sozinha. É a que serve onde o telefone é OBRIGATÓRIO —
 * a agenda pública, por exemplo. Mandar "ou deixe em branco" para quem precisa
 * ser avisado do horário rende uma segunda recusa: a pessoa apaga o campo,
 * tenta de novo e ouve outro não. Quem está sozinho com o celular na mão
 * desiste na segunda.
 */
export const AVISO_TELEFONE_FORMATO =
  `Telefone: informe DDD e número (${TELEFONE_MIN_DIGITOS} a ${TELEFONE_MAX_DIGITOS} dígitos).`

/** Onde o telefone é opcional: cadastro de cliente e agendamento pelo balcão. */
export const AVISO_TELEFONE_INVALIDO =
  `Telefone: informe DDD e número (${TELEFONE_MIN_DIGITOS} a ${TELEFONE_MAX_DIGITOS} dígitos) ou deixe em branco.`

function formatarLocal(d: string) {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return null
}

/**
 * "(41) 98727-5895", com "+55 " na frente quando o valor traz o DDI — é assim
 * que o número chega do WhatsApp, e esconder o DDI já deslocou a máscara uma
 * vez ("+5 (54) 18727-..."). Devolve como veio quando não reconhece: melhor o
 * dono ver o próprio dado mal formatado do que um DDD inventado.
 */
export function formatarTelefone(telefone: string) {
  const d = somenteDigitos(telefone)
  const local = formatarLocal(d)
  if (local) return local
  // 12–13 dígitos: DDI de 2 + número local. Assume padrão brasileiro (55) na
  // ambiguidade — todo cliente chega pelo WhatsApp de uma barbearia daqui.
  if (d.length === 12 || d.length === 13) {
    const resto = formatarLocal(d.slice(2))
    if (resto) return `+${d.slice(0, 2)} ${resto}`
  }
  return telefone
}

/**
 * O número pronto para o WhatsApp — `55` + DDD + número, só dígitos.
 *
 * **O nono dígito.** Celular no Brasil é DDD + 9 + 8 dígitos, mas quem cadastra
 * digita como decorou, e muita gente decorou antes de 2016. O telefone da El
 * Guardians está assim em produção: `(41) 9847-2975`, dez dígitos. O link
 * montado com ele não abre conversa nenhuma — e ninguém percebeu, porque o
 * botão aparece normalmente. Link quebrado não dá erro, só não leva a lugar
 * algum.
 *
 * **Como se sabe que falta:** depois do DDD, celular antigo tem 8 dígitos
 * começando em 6, 7, 8 ou 9; fixo começa em 2, 3, 4 ou 5. É a faixa da Anatel,
 * e é o que separa "faltou o 9" de "é um fixo mesmo".
 *
 * **Fixo não ganha o 9, de propósito:** WhatsApp Business roda em número fixo,
 * e inventar um dígito ali quebraria justamente quem cadastrou certo.
 *
 * Gêmea de `supabase/functions/_shared/whatsapp.ts` — as edges não importam de
 * `src/`, então a regra vive nos dois lugares, com os mesmos casos de teste.
 */
export function numeroParaWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = somenteDigitos(telefone ?? '')
  if (!digitos) return null

  // Tira o DDI para raciocinar sempre sobre o número local — mas só quando o
  // que sobra tem cara de local: `5533445566` com 10 dígitos é um fixo de Santa
  // Maria, cujo DDD é 55, e não um número com DDI.
  let local = digitos
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    local = digitos.slice(2)
  }

  if (local.length === 11) return `55${local}`

  if (local.length === 10) {
    const resto = local.slice(2)
    if (/^[6-9]/.test(resto)) return `55${local.slice(0, 2)}9${resto}`
    return `55${local}`
  }

  return null
}

/** Link wa.me, ou null quando o campo não parece um telefone. */
export function linkWhatsApp(telefone: string): string | null {
  const numero = numeroParaWhatsApp(telefone)
  return numero ? `https://wa.me/${numero}` : null
}
