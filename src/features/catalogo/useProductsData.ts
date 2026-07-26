import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ProductItem } from './types'

export function useProductsData(salonId: string | null) {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('products')
      .select('id, nome, preco_custo, preco_venda, estoque_atual, estoque_minimo, ativo')
      .eq('salon_id', salonId)
      .order('nome')

    if (fetchError) {
      console.error('Erro ao carregar produtos:', fetchError)
      setError('Não foi possível carregar os produtos.')
      setLoading(false)
      return
    }

    setProducts(data ?? [])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { products, loading, error, reload }
}
