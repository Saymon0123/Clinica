export type ServiceItem = {
  id: string
  nome: string
  duracao_minutos: number
  preco: number
  ativo: boolean
}

export type ProductItem = {
  id: string
  nome: string
  preco_custo: number | null
  preco_venda: number | null
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
}
