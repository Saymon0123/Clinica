import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Sale } from './types'

type Period = 'dia' | 'mes'

type OrderRow = {
  id: string
  created_at: string
  closed_at: string | null
  status: 'aberta' | 'fechada' | 'cancelada'
  clients: { nome: string } | { nome: string }[] | null
  professionals: { nome: string } | { nome: string }[] | null
  order_items: { quantidade: number; preco_unitario: number }[]
  payments: { forma_pagamento: string }[]
}

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export function useVendasData(salonId: string | null, period: Period) {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const now = new Date()
    const start =
      period === 'dia'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getFullYear(), now.getMonth(), 1)

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, created_at, closed_at, status, clients(nome), professionals(nome), order_items(quantidade, preco_unitario), payments(forma_pagamento)',
      )
      .eq('salon_id', salonId)
      .neq('status', 'cancelada')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Erro ao carregar vendas:', fetchError)
      setError('Não foi possível carregar as vendas.')
      setLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as OrderRow[]
    setSales(
      rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        closed_at: r.closed_at,
        status: r.status,
        client_nome: one(r.clients)?.nome ?? null,
        professional_nome: one(r.professionals)?.nome ?? null,
        total: r.order_items.reduce((acc, i) => acc + i.quantidade * Number(i.preco_unitario), 0),
        forma_pagamento: r.payments[0]?.forma_pagamento ?? null,
      })),
    )
    setLoading(false)
  }, [salonId, period])

  useEffect(() => {
    reload()
  }, [reload])

  return { sales, loading, error, reload }
}
