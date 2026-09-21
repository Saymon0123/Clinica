/**
 * Saldo de pacotes do cliente — a parte pura, compartilhada entre a Agenda
 * (parte A do plano de pacotes, 20/09) e quem mais precisar mostrar saldo.
 *
 * A fonte é a view `saldo_de_pacotes` (0112), que é DERIVADA de venda −
 * consumo: nunca guarda número, então nunca dessincroniza. Aqui só se decide
 * como APRESENTAR: qual saldo casa com os serviços do agendamento (esses vêm
 * primeiro e ganham o aviso "dá para usar"), e o rótulo de cada linha.
 */

export type SaldoDePacote = {
  pacote_do_cliente_id: string
  pacote: string
  service_id: string
  servico: string
  restante: number
  /** 'YYYY-MM-DD' ou null quando o pacote não vence. */
  expira_em: string | null
  vencido: boolean
}

/** 'YYYY-MM-DD' → 'DD/MM'. Corte de string de propósito: nada de Date para
 *  uma data pura — fuso do aparelho não pode mudar o dia do vencimento. */
function venceEm(expiraEm: string): string {
  const [, mes, dia] = expiraEm.split('-')
  return `${dia}/${mes}`
}

/** "Corte masculino: 3 restantes (vence 12/10)" — singular quando resta 1. */
export function rotuloDoSaldo(s: SaldoDePacote): string {
  const plural = s.restante === 1 ? 'restante' : 'restantes'
  const vence = s.expira_em ? ` (vence ${venceEm(s.expira_em)})` : ''
  return `${s.servico}: ${s.restante} ${plural}${vence}`
}

/**
 * Vigentes, com os que casam com os serviços do agendamento PRIMEIRO.
 *
 * O filtro de `vencido` é cinto de segurança: quem busca já deveria filtrar,
 * mas um saldo vencido anunciado como usável faria o cliente discutir no
 * balcão — pior que não mostrar nada.
 */
export function ordenarPorCobertura(
  saldos: SaldoDePacote[],
  serviceIds: string[],
): SaldoDePacote[] {
  const cobre = new Set(serviceIds)
  return saldos
    .filter((s) => !s.vencido && s.restante > 0)
    .sort((a, b) => Number(cobre.has(b.service_id)) - Number(cobre.has(a.service_id)))
}

/** Algum saldo vigente cobre algum serviço deste agendamento? */
export function cobreAlgumServico(saldos: SaldoDePacote[], serviceIds: string[]): boolean {
  const ids = new Set(serviceIds)
  return saldos.some((s) => !s.vencido && s.restante > 0 && ids.has(s.service_id))
}
