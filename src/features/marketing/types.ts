import type { SegmentoId } from './simulador'

export type ResumoSegmento = {
  segmento: SegmentoId
  clientes: number
  ticketMedio: number
  potencial: number
  ultimaCampanha: string | null
}

export type ClienteElegivel = {
  clientId: string
  nome: string
  telefone: string | null
  ultimoAtendimento: string | null
  visitas: number
  ticketMedio: number
}

export type HorarioOcioso = {
  diaSemana: number
  hora: number
  capacidade: number
  agendadosPorSemana: number
  ocupacao: number
}

export const SEGMENTOS: {
  id: SegmentoId
  titulo: string
  regra: string
  porque: string
}[] = [
  {
    id: 'sumidos',
    titulo: 'Sumidos',
    regra: 'Sem atendimento há mais de 60 dias',
    porque: 'Cliente que já gostou do seu trabalho e parou de vir. O mais barato de trazer de volta.',
  },
  {
    id: 'uma_vez',
    titulo: 'Vieram uma vez só',
    regra: 'Um atendimento, há mais de 30 dias',
    porque: 'Experimentaram e não voltaram. É falha de retenção, e você ainda pode reverter.',
  },
  {
    id: 'aniversariantes',
    titulo: 'Aniversariantes do mês',
    regra: 'Aniversário no mês corrente',
    porque: 'Motivo natural para uma mensagem. Cuidado: boa parte viria mesmo sem desconto.',
  },
  {
    id: 'ocioso',
    titulo: 'Horário ocioso',
    regra: 'Clientes ativos, para as faixas vazias da agenda',
    porque: 'Desconto que preenche horário morto não tira venda de horário cheio.',
  },
]

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
