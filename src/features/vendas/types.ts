export type SaleItemDraft = {
  tipo: 'servico' | 'produto' | 'pacote'
  refId: string
  nome: string
  quantidade: number
  preco_unitario: number
  /** Consumo de crédito: id do pacote do cliente que paga este item (preço 0). */
  viaPacote?: string
  /** Identidade local de um pacote na comanda, para consumo na MESMA venda. */
  uid?: string
  /** Consumo pago por um pacote que está sendo comprado NESTA comanda (uid). */
  viaPacoteNovo?: string
}

export type Sale = {
  id: string
  created_at: string
  closed_at: string | null
  status: 'aberta' | 'fechada' | 'cancelada'
  client_nome: string | null
  professional_nome: string | null
  total: number
  forma_pagamento: string | null
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}
