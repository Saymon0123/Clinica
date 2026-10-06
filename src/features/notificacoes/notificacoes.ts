/**
 * As regras puras do sino de notificações — fora do componente para serem
 * testáveis sem tela.
 *
 * A LISTA em si vem pronta da view `notificacoes_do_salao` (0173): o que o
 * cliente fez sozinho nos últimos 7 dias. Aqui mora só o que é apresentação —
 * a frase de cada tipo, o "há 5 min", e a conta do que ainda não foi visto.
 */

export type TipoDeNotificacao = 'novo_horario' | 'cancelou' | 'remarcou' | 'pediu_dono'

export type Notificacao = {
  chave: string
  tipo: TipoDeNotificacao
  /** Quando o EVENTO aconteceu (criou/cancelou/remarcou/pediu) — ordena a lista. */
  evento_em: string
  /**
   * O horário do atendimento em si — **nulo no `pediu_dono`**, que não tem
   * agendamento nenhum por trás. Era `string` antes da 0216: deixar assim faria
   * a formatação escrever "Invalid Date" no lugar da frase.
   */
  data_hora_inicio: string | null
  origem: string | null
  cliente: string | null
  barbeiro: string | null
  servicos: string | null
  /** O resumo que o agente escreveu ao chamar o dono. Nulo nos outros tipos. */
  detalhe: string | null
}

/** Formata o horário do atendimento: "sáb., 20/09, 14:00". */
function horarioDoAtendimento(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Título e detalhe de cada notificação. O título diz QUEM e O QUÊ; o detalhe
 * diz o horário e com quem. Campos nulos (cliente apagado, serviço removido)
 * caem em palavras neutras em vez de "null marcou undefined".
 */
export function rotuloDaNotificacao(n: Notificacao): { titulo: string; detalhe: string } {
  const cliente = n.cliente?.trim() || 'Um cliente'

  // ANTES de qualquer formatação de horário: este tipo não tem agendamento, e
  // `horarioDoAtendimento(null)` escreveria "Invalid Date" na cara do dono.
  // O detalhe é o resumo que o agente escreveu — quando ele não escreveu, a
  // frase diz isso em vez de ficar vazia.
  if (n.tipo === 'pediu_dono') {
    return {
      titulo: `${cliente} quer falar com você`,
      detalhe: n.detalhe?.trim() || 'O agente não registrou o motivo.',
    }
  }

  const servicos = n.servicos?.trim() || 'um horário'
  const quando = n.data_hora_inicio ? horarioDoAtendimento(n.data_hora_inicio) : 'sem horário'
  const comQuem = n.barbeiro?.trim() ? ` · com ${n.barbeiro.trim()}` : ''

  if (n.tipo === 'cancelou') {
    return { titulo: `${cliente} cancelou o horário`, detalhe: `era ${quando}${comQuem}` }
  }
  if (n.tipo === 'remarcou') {
    return { titulo: `${cliente} mudou o horário`, detalhe: `agora é ${quando}${comQuem}` }
  }
  const porOnde = n.origem === 'publico' ? ' · pelo QR' : n.origem === 'agente' ? ' · pelo WhatsApp' : ''
  return { titulo: `${cliente} marcou ${servicos}`, detalhe: `${quando}${comQuem}${porOnde}` }
}

/**
 * "há 5 min" / "há 3 h" / "ontem" / "12/09" — o tempo do EVENTO, para a lista
 * responder "quando isso chegou?" sem a pessoa fazer conta.
 */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const evento = new Date(iso)
  const diffMs = agora.getTime() - evento.getTime()
  if (diffMs < 60_000) return 'agora'
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `há ${horas} h`

  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1)
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mesmoDia(evento, ontem)) return 'ontem'
  return evento.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Quantas chegaram depois da última vez que ESTA pessoa abriu o sino.
 * `vistoEm` nulo = nunca abriu: tudo conta.
 */
export function contarNaoVistas(lista: Notificacao[], vistoEm: string | null): number {
  if (!vistoEm) return lista.length
  const marco = new Date(vistoEm).getTime()
  return lista.filter((n) => new Date(n.evento_em).getTime() > marco).length
}
