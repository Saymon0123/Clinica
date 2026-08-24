/**
 * O telefone é gravado como cada canal digita: o balcão usa máscara, o agente
 * do WhatsApp usa 55DDDNÚMERO. Quem deduplica é o banco (telefone_norm, os
 * últimos 8 dígitos); aqui ficam as pontes de UI — busca por dígitos, exibição
 * amigável e o link direto para a conversa no WhatsApp.
 */

export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

/** (41) 99999-9999 para números BR; devolve como veio quando não reconhece. */
export function formatarTelefone(telefone: string) {
  let d = somenteDigitos(telefone)
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}

/** Link wa.me, ou null quando o campo não parece um telefone. */
export function linkWhatsApp(telefone: string): string | null {
  let d = somenteDigitos(telefone)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (d.length < 12 || d.length > 13) return null
  return `https://wa.me/${d}`
}
