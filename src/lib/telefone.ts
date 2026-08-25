/**
 * O telefone é gravado como cada canal digita: o balcão usa máscara, o agente
 * do WhatsApp usa 55DDDNÚMERO. Quem deduplica é o banco (telefone_norm, os
 * últimos 8 dígitos); aqui ficam as pontes de UI — busca por dígitos, exibição
 * amigável e o link direto para a conversa no WhatsApp.
 */

export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

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

/** Link wa.me, ou null quando o campo não parece um telefone. */
export function linkWhatsApp(telefone: string): string | null {
  let d = somenteDigitos(telefone)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (d.length < 12 || d.length > 13) return null
  return `https://wa.me/${d}`
}
