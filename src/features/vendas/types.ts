export type SaleItemDraft = {
  tipo: 'servico' | 'produto' | 'pacote'
  refId: string
  nome: string
  quantidade: number
  preco_unitario: number
  /**
   * Pacote do cliente que cobre este item. Quando presente, o item entra com
   * preço zero e um crédito é baixado.
   */
  clientPackageId?: string
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
