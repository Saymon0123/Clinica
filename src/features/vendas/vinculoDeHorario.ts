import type { AppointmentStatus } from '../agenda/types'

/**
 * A venda e o horário da agenda que ela paga (A7 do giro de 10/09, "plano C"
 * de 11/09).
 *
 * A presença é deduzida: 15 minutos depois do fim previsto, horário sem venda
 * vira `faltou` (cron da 0153). Por isso toda venda que pertence a um horário
 * precisa dizer QUAL — senão quem veio e pagou fica registrado como falta, e na
 * reativação duas "faltas" assim pausam um cliente assíduo.
 *
 * Aqui mora só o que é regra e texto. A consulta e o estado ficam na tela.
 */

/** Um horário de hoje do cliente escolhido, que esta venda pode estar pagando. */
export type HorarioDoDia = {
  id: string
  /** ISO, como vem do banco. */
  inicio: string
  status: AppointmentStatus
  professionalId: string
  barbeiro: string | null
}

/**
 * O que uma venda ainda pode concluir. `faltou` entra de propósito: é a
 * correção de quem lançou tarde. `cancelado` não — foi desmarcado de verdade,
 * por alguém, e ressuscitá-lo pela venda seria inventar um atendimento.
 */
export const STATUS_QUE_A_VENDA_CONCLUI = ['agendado', 'confirmado', 'faltou'] as const

/** Falha ao concluir o horário vinculado: código do Postgres, ou a linha que não voltou. */
export type FalhaNoVinculo = { code?: string }

/** Código próprio para o update que não pegou linha nenhuma (horário excluído). */
export const SEM_LINHA = 'SEM_LINHA'

/**
 * O passo que conclui o horário vinculado falhou. A venda inteira é desfeita,
 * e a tela usa `falha` para dizer por quê (ver `mensagemDeFalhaNoVinculo`).
 */
export class FalhaAoConcluirHorario extends Error {
  falha: FalhaNoVinculo
  constructor(falha: FalhaNoVinculo) {
    super(`O horário vinculado não virou concluído (${falha.code ?? 'sem código'})`)
    this.name = 'FalhaAoConcluirHorario'
    this.falha = falha
  }
}

/** '14:00' — no fuso do navegador, que é o do balcão, como o resto do CRM. */
export function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function perguntaDoVinculo(cliente: string, horarios: HorarioDoDia[]): string {
  if (horarios.length !== 1) {
    return `${cliente} tem ${horarios.length} horários hoje. Esta venda é de algum deles?`
  }
  const h = horarios[0]
  const com = h.barbeiro ? ` com ${h.barbeiro}` : ''
  // Dizer que ficou como "não veio" não é detalhe: é o que explica ao
  // barbeiro por que confirmar importa — a venda desfaz a falta.
  if (h.status === 'faltou') {
    return `O horário de ${cliente} hoje às ${horaLocal(h.inicio)}${com} ficou como “não veio”. Esta venda é desse atendimento?`
  }
  return `${cliente} tem horário hoje às ${horaLocal(h.inicio)}${com}. Esta venda é desse atendimento?`
}

/** O botão de cada horário quando há mais de um: '16:30 · Pedro · não veio'. */
export function rotuloDoHorario(h: HorarioDoDia): string {
  const partes = [horaLocal(h.inicio)]
  if (h.barbeiro) partes.push(h.barbeiro)
  if (h.status === 'faltou') partes.push('não veio')
  return partes.join(' · ')
}

/**
 * A venda só sai com a pergunta respondida. As duas omissões custam caro, e
 * por isso nenhuma vira padrão: vincular sem perguntar concluiria o horário
 * das 16h com a venda de um produto às 10h; não vincular deixaria quem veio
 * como "não veio".
 */
export function faltaResponder({
  vinculado,
  semVinculo,
  horarios,
}: {
  vinculado: boolean
  semVinculo: boolean
  horarios: number
}): boolean {
  return !vinculado && !semVinculo && horarios > 0
}

/**
 * Por que o horário não virou concluído. Nada foi salvo (a venda inteira é
 * desfeita), e as duas causas conhecidas não se resolvem tentando de novo —
 * daí a instrução de desvincular, em vez do "tente novamente" de sempre.
 */
export function mensagemDeFalhaNoVinculo(falha: FalhaNoVinculo | null, hora: string | null): string {
  const doHorario = hora ? `das ${hora}` : 'vinculado'
  if (falha?.code === '23P01') {
    return (
      `A cadeira do horário ${doHorario} já foi ocupada por outro atendimento na agenda, então ele não ` +
      'pode virar concluído. Nada foi salvo: toque em "Desvincular" e finalize de novo.'
    )
  }
  if (falha?.code === SEM_LINHA || falha?.code === '23503') {
    return (
      `O horário ${doHorario} não está mais na agenda — pode ter sido excluído. Nada foi salvo: ` +
      'toque em "Desvincular" e finalize de novo.'
    )
  }
  return 'Não foi possível completar a venda. Nada foi salvo, tente novamente.'
}
