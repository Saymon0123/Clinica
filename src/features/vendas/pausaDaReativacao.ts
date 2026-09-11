/**
 * Por que a reserva automática deste cliente está parada (migration 0154).
 *
 * A tela da venda é onde a reserva automática volta: preencher "a cada quantas
 * semanas" é o opt-in. Antes ela escondia a pausa — o campo vinha preenchido, e
 * salvar a venda religava a reserva até de quem tinha pedido pelo WhatsApp para
 * parar (achado 1 do plano C, 11/09).
 */

/** Motivo gravado pelo banco; nulo = pausa antiga, de antes da 0154. */
export type MotivoDaPausa = 'pediu_para_parar' | 'faltas' | 'sem_resposta' | null

export type PausaDaReativacao = { em: string; motivo: MotivoDaPausa }

function dia(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * A frase que substitui o campo pré-preenchido. `pediuParaParar` pede o tom de
 * alerta: é o único caso em que preencher contraria o que o cliente disse.
 */
export function avisoDaPausa(pausa: PausaDaReativacao): { texto: string; pediuParaParar: boolean } {
  const quando = dia(pausa.em)
  switch (pausa.motivo) {
    case 'pediu_para_parar':
      return {
        texto: `Em ${quando}, ele pediu pelo WhatsApp para não reservarmos mais. Só preencha se ele pedir de novo.`,
        pediuParaParar: true,
      }
    case 'faltas':
      return {
        texto: `Parado desde ${quando}: faltou a 2 horários reservados. Preencher retoma a reserva automática.`,
        pediuParaParar: false,
      }
    case 'sem_resposta':
      return {
        texto: `Parado desde ${quando}: não respondeu a 2 convites. Preencher retoma a reserva automática.`,
        pediuParaParar: false,
      }
    default:
      return {
        texto: `Parado desde ${quando}. Preencher retoma a reserva automática.`,
        pediuParaParar: false,
      }
  }
}
