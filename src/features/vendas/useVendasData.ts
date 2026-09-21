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

export function useVendasData(
  salonId: string | null,
  period: Period,
  refMonth?: string,
  refDia?: string,
) {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    // refMonth ('YYYY-MM') navega meses; refDia ('YYYY-MM-DD') escolhe o DIA
    // do filtro "dia" (21/09 — antes era sempre hoje). O parse é por partes,
    // LOCAL: new Date('YYYY-MM-DD') seria UTC e voltaria um dia no Brasil.
    const now = new Date()
    const [ano, mes] =
      period === 'mes' && refMonth ? refMonth.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1]
    const [diaAno, diaMes, diaDia] = refDia
      ? refDia.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    const start =
      period === 'dia'
        ? new Date(diaAno, diaMes - 1, diaDia)
        : new Date(ano, mes - 1, 1)
    // Dia escolhido precisa de FIM: sem ele, um dia passado somaria tudo
    // dali em diante (o "hoje" antigo podia ficar aberto; um dia qualquer não).
    const end = period === 'dia' ? new Date(diaAno, diaMes - 1, diaDia + 1) : new Date(ano, mes, 1)

    let query = supabase
      .from('orders')
      .select(
        'id, created_at, closed_at, status, clients(nome), professionals(nome), order_items(quantidade, preco_unitario), payments(forma_pagamento)',
      )
      .eq('salon_id', salonId)
      .neq('status', 'cancelada')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })
    if (end) query = query.lt('created_at', end.toISOString())

    const { data, error: fetchError } = await query

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
        // Todas as partes do pagamento (achado 41): antes só a primeira
        // aparecia, e "Pix + dinheiro" virava "Pix" na lista.
        formas_pagamento: r.payments.map((p) => p.forma_pagamento),
      })),
    )
    setLoading(false)
  }, [salonId, period, refMonth, refDia])

  useEffect(() => {
    reload()
  }, [reload])

  return { sales, loading, error, reload }
}
