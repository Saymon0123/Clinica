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

export type CommissionRow = {
  professionalNome: string
  percentual: number
  base: number
  valor: number
}

export type FinanceiroData = {
  metrics: Record<MetricKey, MetricData>
  clientsGrowth: { month: string; total: number; novos: number }[]
  revenueCurrent: number
  revenueGoal: number
  topServices: ServiceShare[]
  commissions: CommissionRow[]
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
  commissions: [],
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
  /** Mês do donut da meta: o mês selecionado no filtro "mes", o mês corrente no "dia". */
  monthStart: Date
  monthEnd: Date
}

/** refMonth no formato 'YYYY-MM'; ignorado no filtro "dia" (dia é sempre hoje). */
function computePeriods(filter: PeriodFilter, refMonth: string): Periods {
  const now = new Date()

  if (filter === 'dia') {
    const currentStart = startOfDay(now)
    const currentEnd = endOfDay(now)
    const prevStart = startOfDay(new Date(now.getTime() - 86400000))
    const prevEnd = endOfDay(new Date(now.getTime() - 86400000))
    const sparkDays: Date[] = []
    for (let i = 6; i >= 0; i--) sparkDays.push(startOfDay(new Date(now.getTime() - i * 86400000)))
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    // A janela precisa cobrir o mês inteiro, senão o donut da meta soma só a
    // última semana — era exatamente esse o defeito no filtro "Hoje".
    const windowStart = monthStart < sparkDays[0] ? monthStart : sparkDays[0]
    return { currentStart, currentEnd, prevStart, prevEnd, windowStart, sparkDays, monthStart, monthEnd: currentEnd }
  }

  const [ano, mes] = refMonth.split('-').map(Number)
  const ehMesCorrente = ano === now.getFullYear() && mes === now.getMonth() + 1
  const currentStart = startOfDay(new Date(ano, mes - 1, 1))
  const ultimoDia = ehMesCorrente ? now.getDate() : new Date(ano, mes, 0).getDate()
  const currentEnd = endOfDay(ehMesCorrente ? now : new Date(ano, mes, 0))
  const prevStart = startOfDay(new Date(ano, mes - 2, 1))
  const prevEnd = endOfDay(new Date(ano, mes - 1, 0))
  const sparkDays: Date[] = []
  for (let d = 1; d <= ultimoDia; d++) {
    sparkDays.push(startOfDay(new Date(ano, mes - 1, d)))
  }
  return {
    currentStart,
    currentEnd,
    prevStart,
    prevEnd,
    windowStart: prevStart,
    sparkDays,
    monthStart: currentStart,
    monthEnd: currentEnd,
  }
}

function changePct(value: number, previous: number): number | null {
  if (previous === 0) return null
  return ((value - previous) / previous) * 100
}

type ApptRow = { client_id: string | null; status: string; data_hora_inicio: string }
type CancelRow = { cancelado_em: string }
type CommissionDbRow = {
  professional_id: string
  percentual_aplicado: number
  valor_calculado: number
  order_items: { preco_unitario: number; quantidade: number }
}
type OrderRow = {
  closed_at: string | null
  payments: { valor: number }[]
  order_items: {
    tipo: string
    service_id: string | null
    professional_id: string | null
    quantidade: number
    preco_unitario: number
  }[]
}

/**
 * As consultas não filtram por profissional de propósito: a RLS (0015) já faz
 * isso. Gestor enxerga o salão inteiro; barbeiro só as comandas, agendamentos
 * e comissões dele — os mesmos cards mostram o salão para um e "os seus
 * números" para o outro, como o subtítulo da página promete.
 */
export function useFinanceiroData(salonId: string | null, filter: PeriodFilter, refMonth: string) {
  const [data, setData] = useState<FinanceiroData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const p = computePeriods(filter, refMonth)
    const windowStartISO = p.windowStart.toISOString()
    const currentEndISO = p.currentEnd.toISOString()

    const [
      apptResult,
      cancelResult,
      ordersResult,
      clientsResult,
      commissionsResult,
      servicesResult,
      professionalsResult,
      salonResult,
    ] =
      await Promise.all([
      supabase
        .from('appointments')
        .select('client_id, status, data_hora_inicio')
        .eq('salon_id', salonId)
        .gte('data_hora_inicio', windowStartISO)
        .lte('data_hora_inicio', currentEndISO)
        .neq('status', 'bloqueio'),
      // Cancelamentos contam pela data em que ACONTECEU o cancelamento
      // (cancelado_em, carimbado por trigger), não pela data do horário —
      // cancelar hoje um horário de setembro é um cancelamento de hoje.
      supabase
        .from('appointments')
        .select('cancelado_em')
        .eq('salon_id', salonId)
        .gte('cancelado_em', windowStartISO)
        .lte('cancelado_em', currentEndISO),
      supabase
        .from('orders')
        .select(
          'closed_at, payments(valor), order_items(tipo, service_id, professional_id, quantidade, preco_unitario)',
        )
        .eq('salon_id', salonId)
        .eq('status', 'fechada')
        .gte('closed_at', windowStartISO)
        .lte('closed_at', currentEndISO),
      supabase.rpc('clientes_por_mes', { p_salon_id: salonId }),
      // Comissões vêm da tabela `commissions`, congeladas no percentual da
      // época da venda — recalcular com o percentual atual reescreveria o
      // passado se o dono mudasse a comissão no meio do mês.
      supabase
        .from('commissions')
        .select(
          'professional_id, percentual_aplicado, valor_calculado, order_items!inner(preco_unitario, quantidade, orders!inner(salon_id, status, closed_at))',
        )
        .eq('order_items.orders.salon_id', salonId)
        .eq('order_items.orders.status', 'fechada')
        .gte('order_items.orders.closed_at', p.currentStart.toISOString())
        .lte('order_items.orders.closed_at', currentEndISO),
      supabase.from('services').select('id, nome').eq('salon_id', salonId),
      supabase
        .from('professionals')
        .select('id, nome, comissao_percentual')
        .eq('salon_id', salonId),
      supabase.from('salons').select('meta_faturamento_mensal').eq('id', salonId).maybeSingle(),
    ])

    if (apptResult.error || cancelResult.error || ordersResult.error || clientsResult.error) {
      console.error(
        apptResult.error || cancelResult.error || ordersResult.error || clientsResult.error,
      )
      setError('Não foi possível carregar os dados financeiros.')
      setLoading(false)
      return
    }

    const appts = (apptResult.data ?? []) as ApptRow[]
    const cancels = (cancelResult.data ?? []) as CancelRow[]
    const orders = (ordersResult.data ?? []) as unknown as OrderRow[]
    const clientsMeses = (clientsResult.data ?? []) as { mes: string; novos: number; total: number }[]
    const commissionRows = (commissionsResult.data ?? []) as unknown as CommissionDbRow[]
    const serviceNames = new Map(
      (servicesResult.data ?? []).map((s) => [s.id as string, s.nome as string]),
    )
    const professionalsInfo = new Map(
      (professionalsResult.data ?? []).map((pr) => [
        pr.id as string,
        { nome: pr.nome as string, pct: pr.comissao_percentual != null ? Number(pr.comissao_percentual) : 0 },
      ]),
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

    // Faturamento = soma dos pagamentos das comandas fechadas. Premissa: todo
    // payment é receita — se um dia existir estorno/troco como valor negativo,
    // esta conta o abate sem distinguir.
    const sumFaturamento = (rows: OrderRow[]) =>
      rows.reduce((sum, o) => sum + (o.payments ?? []).reduce((s, pay) => s + Number(pay.valor), 0), 0)
    const countAgendamentos = (rows: ApptRow[]) => rows.filter((a) => a.status !== 'cancelado').length
    const cancelsIn = (start: Date, end: Date) =>
      cancels.filter((c) => {
        const t = new Date(c.cancelado_em).getTime()
        return t >= start.getTime() && t <= end.getTime()
      }).length
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
        value: cancelsIn(p.currentStart, p.currentEnd),
        previous: cancelsIn(p.prevStart, p.prevEnd),
        changePct: changePct(cancelsIn(p.currentStart, p.currentEnd), cancelsIn(p.prevStart, p.prevEnd)),
        spark: buildSpark((s, e) => cancelsIn(s, e)),
      },
    }

    // Crescimento de clientes: 12 linhas prontas da RPC clientes_por_mes —
    // contar no banco em vez de baixar a tabela clients inteira.
    const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const clientsGrowth = clientsMeses.map((m) => ({
      month: monthLabels[Number(m.mes.slice(5, 7)) - 1],
      total: m.total,
      novos: m.novos,
    }))

    // Faturamento do mês para o donut da meta: o mês selecionado no seletor,
    // ou o mês corrente quando o filtro é "Hoje".
    const revenueCurrent = sumFaturamento(ordersIn(p.monthStart, p.monthEnd))

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
    // Share sobre o TOTAL vendido, não sobre o 1º colocado — barra 100% cheia
    // sugeria "domina tudo" mesmo quando o campeão tinha 30% das vendas.
    const totalServicos = [...serviceRevenue.values()].reduce((s, v) => s + v, 0)
    const topServices: ServiceShare[] = topEntries.map(([id, revenue]) => ({
      nome: serviceNames.get(id) ?? 'Serviço',
      revenue,
      share: totalServicos ? (revenue / totalServicos) * 100 : 0,
    }))

    // Comissões do período: registros congelados da tabela `commissions`,
    // com o percentual aplicado na hora da venda. O percentual exibido é a
    // média ponderada (valor/base) — cobre o caso de mudar no meio do mês.
    const commissionByProf = new Map<string, { base: number; valor: number }>()
    for (const row of commissionRows) {
      const base = Number(row.order_items.preco_unitario) * (row.order_items.quantidade ?? 1)
      const acc = commissionByProf.get(row.professional_id) ?? { base: 0, valor: 0 }
      acc.base += base
      acc.valor += Number(row.valor_calculado)
      commissionByProf.set(row.professional_id, acc)
    }
    const commissions: CommissionRow[] = [...commissionByProf.entries()]
      .map(([profId, { base, valor }]) => ({
        professionalNome: professionalsInfo.get(profId)?.nome ?? 'Profissional',
        percentual: base > 0 ? (valor / base) * 100 : 0,
        base,
        valor,
      }))
      .filter((c) => c.valor > 0)
      .sort((a, b) => b.valor - a.valor)

    setData({
      metrics,
      clientsGrowth,
      revenueCurrent,
      revenueGoal: Number(salonResult.data?.meta_faturamento_mensal ?? META_FATURAMENTO_MENSAL),
      topServices,
      commissions,
    })
    setLoading(false)
  }, [salonId, filter, refMonth])

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
