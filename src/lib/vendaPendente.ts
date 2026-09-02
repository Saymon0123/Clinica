import type { SalePrefill } from '../features/vendas/NewSaleModal'

/**
 * O atendimento que está esperando cobrança.
 *
 * O "Concluir e cobrar" da agenda levava o vínculo do agendamento por
 * parâmetro de URL — que era apagado no mesmo instante em que era lido. A
 * partir daí o vínculo vivia só na memória do componente: trocar de aba,
 * fechar o modal sem querer ou clicar em "Nova venda" zerava tudo. Sem
 * vínculo, o passo que marca o agendamento como `concluido` não roda, e o
 * cron cancela o horário que foi atendido e pago (achado 7 da revisão).
 *
 * Guardar aqui faz o vínculo sobreviver ao caminho inteiro até a venda ser
 * salva — que é o único momento em que ele deixa de ser necessário.
 *
 * `sessionStorage` e não `localStorage`: a pendência é do expediente, não da
 * vida. Fechar o navegador encerra o assunto.
 */
const CHAVE = 'clubcut:venda-pendente'

export type VendaPendente = SalePrefill & {
  /** Para a faixa dizer de quem é o atendimento, sem ir ao banco. */
  clienteNome?: string
  horaLocal?: string
}

function chaveDo(salonId: string) {
  return `${CHAVE}:${salonId}`
}

export function guardarVendaPendente(salonId: string, venda: VendaPendente) {
  try {
    sessionStorage.setItem(chaveDo(salonId), JSON.stringify(venda))
  } catch {
    // Navegador com storage bloqueado: o fluxo segue em memória, como antes.
  }
}

export function lerVendaPendente(salonId: string): VendaPendente | null {
  try {
    const bruto = sessionStorage.getItem(chaveDo(salonId))
    if (!bruto) return null
    const venda = JSON.parse(bruto) as VendaPendente
    return venda.appointmentId ? venda : null
  } catch {
    return null
  }
}

export function limparVendaPendente(salonId: string) {
  try {
    sessionStorage.removeItem(chaveDo(salonId))
  } catch {
    // Idem: nada a fazer, e não é motivo para quebrar a tela.
  }
}
