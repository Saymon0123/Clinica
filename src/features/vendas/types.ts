export type SaleItemDraft = {
  /**
   * Identidade da LINHA na comanda — é a `key` do React. Única por item, gerada
   * com `gerarId()` na hora em que o item entra.
   *
   * Não confundir com `uid`, que é o VÍNCULO de negócio de um pacote com os
   * consumos da mesma venda e só existe em pacote. Esta existe em todo item.
   *
   * Obrigatória de propósito: a chave por índice fazia a caixa de preço mostrar
   * o valor do item REMOVIDO (achado M6 do giro de 10/09). Opcional, um próximo
   * ponto de criação poderia esquecê-la em silêncio; obrigatória, o TypeScript
   * recusa.
   */
  chave: string
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
  /** Uma entrada por parte do pagamento; vazio = comanda sem pagamento gravado. */
  formas_pagamento: string[]
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}
