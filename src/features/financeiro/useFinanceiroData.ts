import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PeriodFilter = 'dia' | 'mes'

export type FinanceiroSummary = {
  faturamento: number
  clientesAtendidos: number
  agendamentos: number
  cancelamentos: number
}

function periodBounds(filter: PeriodFilter) {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  if (filter === 'dia') {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(end.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

const EMPTY_SUMMARY: FinanceiroSummary = {
  faturamento: 0,
  clientesAtendidos: 0,
  agendamentos: 0,
  cancelamentos: 0,
}

export function useFinanceiroData(salonId: string | null, filter: PeriodFilter) {
  const [summary, setSummary] = useState<FinanceiroSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { start, end } = periodBounds(filter)

    const [appointmentsResult, ordersResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('client_id, status')
        .eq('salon_id', salonId)
        .gte('data_hora_inicio', start)
        .lte('data_hora_inicio', end)
        .neq('status', 'bloqueio'),
      supabase
        .from('orders')
        .select('id, status, closed_at, payments(valor)')
        .eq('salon_id', salonId)
        .eq('status', 'fechada')
        .gte('closed_at', start)
        .lte('closed_at', end),
    ])

    if (appointmentsResult.error || ordersResult.error) {
      console.error(appointmentsResult.error || ordersResult.error)
      setError('Não foi possível carregar os dados financeiros.')
      setLoading(false)
      return
    }

    const appointments = appointmentsResult.data ?? []
    const agendamentos = appointments.filter((a) => a.status !== 'cancelado').length
    const cancelamentos = appointments.filter((a) => a.status === 'cancelado').length
    const clientesAtendidos = new Set(
      appointments.filter((a) => a.status === 'concluido' && a.client_id).map((a) => a.client_id),
    ).size

    const orders = (ordersResult.data ?? []) as unknown as { payments: { valor: number }[] }[]
    const faturamento = orders.reduce(
      (sum, order) => sum + order.payments.reduce((s, p) => s + Number(p.valor), 0),
      0,
    )

    setSummary({ faturamento, clientesAtendidos, agendamentos, cancelamentos })
    setLoading(false)
  }, [salonId, filter])

  useEffect(() => {
    reload()
  }, [reload])

  return { summary, loading, error, reload }
}
