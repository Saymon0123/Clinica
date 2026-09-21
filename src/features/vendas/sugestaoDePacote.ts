import type { SaleItemDraft } from './types'

/**
 * A cutucada do caixa (parte C do plano de pacotes, 20/09).
 *
 * A caixinha de saldos já mostra "restam N" com o botão "Usar 1 do pacote" —
 * mas ela é passiva: o barbeiro pode ter o Corte COBRADO na comanda com a
 * caixinha dizendo "restam 3" logo acima, e finalizar sem ligar os pontos. O
 * cliente que pagou adiantado paga de novo, e ninguém percebe.
 *
 * Aqui se decide QUANDO cutucar: para cada item de serviço cobrado (preço > 0,
 * sem vínculo de pacote) que casa com um saldo ainda disponível, sai uma
 * sugestão de troca. A troca em si continua sendo um clique do barbeiro —
 * dinheiro é decisão humana; o sistema só torna impossível não ver.
 */

/** O que a sugestão precisa saber de um saldo — cabe no `SaldoPacote` do caixa. */
export type SaldoUsavel = {
  pacote_do_cliente_id: string
  service_id: string
  servico: string
  restante: number
}

export type SugestaoDeTroca<S extends SaldoUsavel = SaldoUsavel> = {
  /** `chave` da linha da comanda que poderia sair do pacote. */
  chaveDoItem: string
  /** O MESMO objeto de saldo recebido — genérico para o chamador não precisar
   *  de cast ao devolver o saldo dele para o botão de troca. */
  saldo: S
}

/**
 * Uma sugestão por linha cobrada que ainda cabe no saldo.
 *
 * A disponibilidade desconta o que JÁ está na comanda como consumo
 * (`viaPacote`), na mesma conta que o botão "Usar 1 do pacote" faz — sugerir
 * além do restante mandaria o barbeiro para a trava de erro. Duas linhas
 * cobradas do mesmo serviço com 1 crédito sobrando geram UMA sugestão.
 */
export function sugerirTrocas<S extends SaldoUsavel>(
  items: SaleItemDraft[],
  saldos: S[],
): SugestaoDeTroca<S>[] {
  const disponivel = new Map<string, number>()
  for (const s of saldos) {
    const usadosNaComanda = items.filter(
      (i) => i.viaPacote === s.pacote_do_cliente_id && i.refId === s.service_id,
    ).length
    disponivel.set(chaveDoSaldo(s), s.restante - usadosNaComanda)
  }

  const sugestoes: SugestaoDeTroca<S>[] = []
  for (const item of items) {
    if (item.tipo !== 'servico') continue
    if (item.viaPacote || item.viaPacoteNovo) continue
    if (item.preco_unitario <= 0) continue
    const saldo = saldos.find(
      (s) => s.service_id === item.refId && (disponivel.get(chaveDoSaldo(s)) ?? 0) > 0,
    )
    if (!saldo) continue
    disponivel.set(chaveDoSaldo(saldo), (disponivel.get(chaveDoSaldo(saldo)) ?? 0) - 1)
    sugestoes.push({ chaveDoItem: item.chave, saldo })
  }
  return sugestoes
}

function chaveDoSaldo(s: SaldoUsavel): string {
  return `${s.pacote_do_cliente_id}::${s.service_id}`
}
