/**
 * Quais INSERTs em `appointments` viram o aviso "Novo agendamento" (achado 35
 * da revisão de 01/09).
 *
 * O canal de realtime entrega todo insert da unidade — inclusive o que a
 * própria equipe acabou de fazer na tela ao lado, que tocava som e abria um
 * cartão avisando à pessoa o que ela mesma tinha feito. O aviso é para o que
 * chega de FORA: o agente do WhatsApp, o QR do balcão, a reativação
 * automática. `origem = 'crm'` é alguém logado criando na Agenda, e a Agenda
 * já mostra o bloco. Bloqueio de horário (almoço, folga) também não é "novo
 * agendamento": não tem cliente.
 */
export type LinhaInserida = {
  id: string
  origem?: string | null
  status?: string | null
}

export function deveAvisar(linha: LinhaInserida): boolean {
  if (linha.status === 'bloqueio') return false
  if (linha.origem === 'crm') return false
  return true
}
