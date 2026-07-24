import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PeriodFilter = 'dia' | 'mes'

// Meta mensal de faturamento (placeholder — será configurável futuramente).
export const META_FATURAMENTO_MENSAL = 3000

export type MetricKey = 'faturamento' | 'clientesAtendidos' | 'agendamentos' | 'cancelamentos'

export type MetricData = {
  value: number
  previous: number
  changePct: number | null
  spark: { x: string; y: number }[]
}

export type ServiceShare = {
  nome: string
  revenue: number
  share: number
}

export type FinanceiroData = {
  metrics: Record<MetricKey, MetricData>
  clientsGrowth: { month: string; total: number }[]
  revenueCurrent: number
  revenueGoal: number
  topServices: ServiceShare[]
}

const EMPTY_METRIC: MetricData = { value: 0, previous: 0, changePct: null, spark: [] }

const EMPTY_DATA: FinanceiroData = {
  metrics: {
    faturamento: EMPTY_METRIC,
    clientesAtendidos: EMPTY_METRIC,
    agendamentos: EMPTY_METRIC,
    cancelamentos: EMPTY_METRIC,
  },
  clientsGrowth: [],
  revenueCurrent: 0,
  revenueGoal: META_FATURAMENTO_MENSAL,
  topServices: [],
}

function dayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

type Periods = {
  currentStart: Date
  currentEnd: Date
  prevStart: Date
  prevEnd: Date
  windowStart: Date
  sparkDays: Date[]
}

function computePeriods(filter: PeriodFilter): Periods {
  const now = new Date()

  if (filter === 'dia') {
    const currentStart = startOfDay(now)
    const currentEnd = endOfDay(now)
    const prevStart = startOfDay(new Date(now.getTime() - 86400000))
    const prevEnd = endOfDay(new Date(now.getTime() - 86400000))
    const sparkDays: Date[] = []
    for (let i = 6; i >= 0; i--) sparkDays.push(startOfDay(new Date(now.getTime() - i * 86400000)))
    return { currentStart, currentEnd, prevStart, prevEnd, windowStart: sparkDays[0], sparkDays }
  }

  const currentStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
  const currentEnd = endOfDay(now)
  const prevStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const prevEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
  const sparkDays: Date[] = []
  for (let d = 1; d <= now.getDate(); d++) {
    sparkDays.push(startOfDay(new Date(now.getFullYear(), now.getMonth(), d)))
  }
  return { currentStart, currentEnd, prevStart, prevEnd, windowStart: prevStart, sparkDays }
}

function changePct(value: number, previous: number): number | null {
  if (previous === 0) return null
  return ((value - previous) / previous) * 100
}

type ApptRow = { client_id: string | null; status: string; data_hora_inicio: string }
type OrderRow = {
  closed_at: string | null
  payments: { valor: number }[]
  order_items: { tipo: string; service_id: string | null; quantidade: number; preco_unitario: number }[]
}

export function useFinanceiroData(salonId: string | null, filter: PeriodFilter) {
  const [data, setData] = useState<FinanceiroData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const p = computePeriods(filter)
    const windowStartISO = p.windowStart.toISOString()
    const currentEndISO = p.currentEnd.toISOString()

    const [apptResult, ordersResult, clientsResult, servicesResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('client_id, status, data_hora_inicio')
        .eq('salon_id', salonId)
        .gte('data_hora_inicio', windowStartISO)
        .lte('data_hora_inicio', currentEndISO)
        .neq('status', 'bloqueio'),
      supabase
        .from('orders')
        .select('closed_at, payments(valor), order_items(tipo, service_id, quantidade, preco_unitario)')
        .eq('salon_id', salonId)
        .eq('status', 'fechada')
        .gte('closed_at', windowStartISO)
        .lte('closed_at', currentEndISO),
      supabase.from('clients').select('created_at').eq('salon_id', salonId),
      supabase.from('services').select('id, nome').eq('salon_id', salonId),
    ])

    if (apptResult.error || ordersResult.error || clientsResult.error || servicesResult.error) {
      console.error(
        apptResult.error || ordersResult.error || clientsResult.error || servicesResult.error,
      )
      setError('Não foi possível carregar os dados financeiros.')
      setLoading(false)
      return
    }

    const appts = (apptResult.data ?? []) as ApptRow[]
    const orders = (ordersResult.data ?? []) as unknown as OrderRow[]
    const clients = (clientsResult.data ?? []) as { created_at: string }[]
    const serviceNames = new Map(
      (servicesResult.data ?? []).map((s) => [s.id as string, s.nome as string]),
    )

    // Helpers de filtro por intervalo
    const apptsIn = (start: Date, end: Date) =>
      appts.filter((a) => {
        const t = new Date(a.data_hora_inicio).getTime()
        return t >= start.getTime() && t <= end.getTime()
      })
    const ordersIn = (start: Date, end: Date) =>
      orders.filter((o) => {
        if (!o.closed_at) return false
        const t = new Date(o.closed_at).getTime()
        return t >= start.getTime() && t <= end.getTime()
      })

    const sumFaturamento = (rows: OrderRow[]) =>
      rows.reduce((sum, o) => sum + (o.payments ?? []).reduce((s, pay) => s + Number(pay.valor), 0), 0)
    const countAgendamentos = (rows: ApptRow[]) => rows.filter((a) => a.status !== 'cancelado').length
    const countCancelamentos = (rows: ApptRow[]) => rows.filter((a) => a.status === 'cancelado').length
    const countClientesAtendidos = (rows: ApptRow[]) =>
      new Set(rows.filter((a) => a.status === 'concluido' && a.client_id).map((a) => a.client_id)).size

    const curAppts = apptsIn(p.currentStart, p.currentEnd)
    const prevAppts = apptsIn(p.prevStart, p.prevEnd)
    const curOrders = ordersIn(p.currentStart, p.currentEnd)
    const prevOrders = ordersIn(p.prevStart, p.prevEnd)

    // Sparklines: valor por dia da janela
    const buildSpark = (fn: (start: Date, end: Date) => number) =>
      p.sparkDays.map((d) => ({ x: dayKey(d), y: fn(startOfDay(d), endOfDay(d)) }))

    const metrics: Record<MetricKey, MetricData> = {
      faturamento: {
        value: sumFaturamento(curOrders),
        previous: sumFaturamento(prevOrders),
        changePct: changePct(sumFaturamento(curOrders), sumFaturamento(prevOrders)),
        spark: buildSpark((s, e) => sumFaturamento(ordersIn(s, e))),
      },
      clientesAtendidos: {
        value: countClientesAtendidos(curAppts),
        previous: countClientesAtendidos(prevAppts),
        changePct: changePct(countClientesAtendidos(curAppts), countClientesAtendidos(prevAppts)),
        spark: buildSpark((s, e) => countClientesAtendidos(apptsIn(s, e))),
      },
      agendamentos: {
        value: countAgendamentos(curAppts),
        previous: countAgendamentos(prevAppts),
        changePct: changePct(countAgendamentos(curAppts), countAgendamentos(prevAppts)),
        spark: buildSpark((s, e) => countAgendamentos(apptsIn(s, e))),
      },
      cancelamentos: {
        value: countCancelamentos(curAppts),
        previous: countCancelamentos(prevAppts),
        changePct: changePct(countCancelamentos(curAppts), countCancelamentos(prevAppts)),
        spark: buildSpark((s, e) => countCancelamentos(apptsIn(s, e))),
      },
    }

    // Crescimento de clientes: total acumulado nos últimos 12 meses
    const now = new Date()
    const clientsGrowth: { month: string; total: number }[] = []
    const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    for (let i = 11; i >= 0; i--) {
      const monthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() - i + 1, 0))
      const total = clients.filter((c) => new Date(c.created_at).getTime() <= monthEnd.getTime()).length
      clientsGrowth.push({ month: monthLabels[monthEnd.getMonth()], total })
    }

    // Faturamento do mês (para o donut da meta), independente do filtro
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    const revenueCurrent = sumFaturamento(ordersIn(monthStart, endOfDay(now)))

    // Serviços mais vendidos no período selecionado
    const serviceRevenue = new Map<string, number>()
    for (const o of curOrders) {
      for (const item of o.order_items ?? []) {
        if (item.tipo !== 'servico' || !item.service_id) continue
        const rev = Number(item.preco_unitario) * (item.quantidade ?? 1)
        serviceRevenue.set(item.service_id, (serviceRevenue.get(item.service_id) ?? 0) + rev)
      }
    }
    const topEntries = [...serviceRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const maxRevenue = topEntries.length ? topEntries[0][1] : 0
    const topServices: ServiceShare[] = topEntries.map(([id, revenue]) => ({
      nome: serviceNames.get(id) ?? 'Serviço',
      revenue,
      share: maxRevenue ? (revenue / maxRevenue) * 100 : 0,
    }))

    setData({
      metrics,
      clientsGrowth,
      revenueCurrent,
      revenueGoal: META_FATURAMENTO_MENSAL,
      topServices,
    })
    setLoading(false)
  }, [salonId, filter])

  useEffect(() => {
    reload()
  }, [reload])

  // Atualização em tempo real: recarrega quando muda algo em appointments, orders ou clients
  useEffect(() => {
    if (!salonId) return
    const channel = supabase
      .channel(`financeiro_${salonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `salon_id=eq.${salonId}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `salon_id=eq.${salonId}` }, () => reload())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [salonId, reload])

  return { data, loading, error, reload }
}
