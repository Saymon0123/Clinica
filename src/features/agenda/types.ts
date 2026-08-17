export type Professional = {
  id: string
  nome: string
  ativo: boolean
}

export type Service = {
  id: string
  nome: string
  duracao_minutos: number
  preco: number
}

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'bloqueio'
  // Aceito no banco desde a migration 0063, mas faltava aqui.
  | 'faltou'

export type Appointment = {
  id: string
  professional_id: string
  client_id: string | null
  service_id: string | null
  data_hora_inicio: string
  data_hora_fim: string
  status: AppointmentStatus
  /**
   * Quando alguém marcou que o cliente chegou na barbearia.
   *
   * Nulo **não** quer dizer que faltou — quer dizer que ninguém confirmou. É
   * data e hora, e não um status, porque chegar é independente de confirmar ou
   * concluir, e porque a política de atraso vai precisar saber *quanto*
   * atrasou, não só que atrasou.
   */
  chegou_em?: string | null
  /**
   * Quando o atendimento começou de fato — o cliente sentou na cadeira.
   *
   * Com a duração prevista (`data_hora_fim - data_hora_inicio`) dá a previsão
   * de término, que é o que permite responder a quem espera quanto falta.
   * Nulo = chegou, mas ainda não sentou.
   */
  iniciado_em?: string | null
  client_nome?: string | null
  service_nome?: string | null
}
