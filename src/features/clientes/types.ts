export type Client = {
  id: string
  nome: string
  telefone: string | null
  aniversario: string | null
  observacao: string | null
  created_at: string
  /** Último agendamento concluído (view clientes_com_ultima_visita); null = nunca veio. */
  ultima_visita: string | null
}
