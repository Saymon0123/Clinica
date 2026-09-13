/**
 * Qual salão o pedido mandou mexer — e a recusa quando ele não disse.
 *
 * Parece uma checagem boba. Não é: numa rede, cada unidade tem a própria
 * instância na Evolution (`salon-<id>`), com número e conversas próprios. Quem
 * resolve o salão "pelo primeiro vínculo do usuário" escolhe uma unidade
 * qualquer — e `disconnect` derruba o WhatsApp de uma barbearia que está
 * atendendo, enquanto o dono acha que desligou outra.
 *
 * ISSO JÁ ESTEVE NO CÓDIGO. Em 26/07/2026 o commit "Conexao do WhatsApp
 * respeita a unidade selecionada" fez a tela passar a mandar o `salonId` — e
 * deixou o caminho antigo como fallback, para o caso de alguém não mandar:
 *
 *     const { data: vinculo } = body.salonId
 *       ? await consulta.eq('salon_id', body.salonId).maybeSingle()
 *       : await consulta.limit(1).maybeSingle()   // <- o defeito, preservado
 *
 * O comentário logo acima dessa linha explicava por que pegar o primeiro
 * vínculo era perigoso. O `else` fazia exatamente isso. Ficou 49 dias assim.
 *
 * Não há fallback seguro para esta pergunta. Um pedido que não diz o salão é
 * um pedido ambíguo, e ambiguidade em ação destrutiva se resolve recusando —
 * nunca escolhendo por conta própria. Quem chama sabe qual unidade está na
 * tela; se não sabe, o usuário também não saberia qual foi mexida.
 */

export class SemSalao extends Error {
  constructor() {
    super('O pedido não disse em qual salão mexer.')
    this.name = 'SemSalao'
  }
}

/**
 * Devolve o `salonId` do corpo do pedido, ou levanta `SemSalao`.
 *
 * `unknown` de propósito: o corpo vem de `req.json()` e pode trazer qualquer
 * coisa — número, objeto, `null`. Nada disso é um salão.
 */
export function salaoDoPedido(body: { salonId?: unknown } | null | undefined): string {
  const bruto = body?.salonId
  if (typeof bruto !== 'string') throw new SemSalao()

  const id = bruto.trim()
  if (!id) throw new SemSalao()

  return id
}
