/**
 * Formata telefone brasileiro para exibição.
 *
 * Existe porque a aba WEB mostrava `+5 (54) 18727-5895` para o número
 * `554187275895` — o certo é `+55 (41) 8727-5895`. A versão anterior assumia
 * que o número local tem **sempre 9 dígitos** e fatiava a string a partir do
 * fim com posições fixas; um número antigo, de 8 dígitos, deslocava tudo uma
 * casa e comia um dígito do DDI.
 *
 * Os dois formatos convivem no Brasil e o WhatsApp entrega os dois — é o mesmo
 * motivo pelo qual o banco casa cliente por `telefone_norm` (últimos 8 dígitos)
 * em vez de comparar o número inteiro. Ver docs/n8n-integration.md.
 *
 * Comprimentos possíveis, com DDD sempre em 2 dígitos:
 *   10 = DDD + 8      11 = DDD + 9
 *   12 = 55 + DDD + 8 13 = 55 + DDD + 9
 */
export function formatarTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')

  // Curto demais para ter DDD: devolve como veio em vez de inventar estrutura.
  if (digitos.length < 10) return telefone

  const tamanhoLocal = digitos.length === 11 || digitos.length === 13 ? 9 : 8
  const local = digitos.slice(-tamanhoLocal)
  const ddd = digitos.slice(-(tamanhoLocal + 2), -tamanhoLocal)
  const ddi = digitos.slice(0, digitos.length - tamanhoLocal - 2)

  const corte = tamanhoLocal === 9 ? 5 : 4
  const numero = `${local.slice(0, corte)}-${local.slice(corte)}`

  return `${ddi ? `+${ddi} ` : ''}(${ddd}) ${numero}`
}
