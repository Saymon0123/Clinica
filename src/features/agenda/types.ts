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

export type AppointmentStatus = 'agendado' | 'confirmado' | 'concluido' | 'cancelado' | 'bloqueio'

export type Appointment = {
  id: string
  professional_id: string
  client_id: string | null
  service_id: string | null
  data_hora_inicio: string
  data_hora_fim: string
  status: AppointmentStatus
  client_nome?: string | null
  service_nome?: string | null
}
