export type Client = {
  id: string
  nome: string
  telefone: string | null
  aniversario: string | null
  observacao: string | null
  created_at: string
  /** Último agendamento concluído (view clientes_com_ultima_visita); null = nunca veio. */
  ultima_visita: string | null
  /**
   * Pediu para não receber mensagem de reengajamento (reativação, aviso de
   * retorno, campanha). **Não** bloqueia o lembrete do horário que ele mesmo
   * marcou — isso é serviço que ele contratou ao marcar.
   */
  recusou_contato: boolean
}
