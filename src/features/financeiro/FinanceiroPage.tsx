import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarX,
  DollarSign,
  Users,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Pencil,
  Download,
} from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useSalon } from '../auth/useSalon'
import { useFinanceiroData, type MetricKey, type PeriodFilter } from './useFinanceiroData'
import { StatsCard } from '../../components/StatsCard'
import { RadialGoal } from '../../components/RadialGoal'
import { VendasSection } from '../vendas/VendasSection'
import type { SalePrefill } from '../vendas/NewSaleModal'
import { EditGoalModal } from './EditGoalModal'
import { ExportReportModal } from './ExportReportModal'

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CARD_CONFIG: { key: MetricKey; label: string; icon: typeof DollarSign; format: 'currency' | 'number' }[] = [
  { key: 'faturamento', label: 'Faturamento', icon: DollarSign, format: 'currency' },
  { key: 'clientesAtendidos', label: 'Clientes atendidos', icon: Users, format: 'number' },
  { key: 'agendamentos', label: 'Agendamentos', icon: CalendarCheck, format: 'number' },
  { key: 'cancelamentos', label: 'Cancelamentos', icon: CalendarX, format: 'number' },
]

function ChangeBadge({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return null
  const positive = invert ? pct < 0 : pct >= 0
  const Icon = pct >= 0 ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? 'text-success' : 'text-danger'
      }`}
    >
      <Icon size={13} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export function FinanceiroPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [filter, setFilter] = useState<PeriodFilter>('mes')
  const { data, loading, error, reload } = useFinanceiroData(salonId, filter)
  const [editingGoal, setEditingGoal] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [tab, setTab] = useState<'visao' | 'vendas'>('visao')
  const [searchParams, setSearchParams] = useSearchParams()
  const [salePrefill, setSalePrefill] = useState<SalePrefill | null>(null)

  // Veio do "Concluir e cobrar" da agenda: abre direto na aba de vendas.
  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (appointmentId) {
      setTab('vendas')
      setSalePrefill({
        appointmentId,
        clientId: searchParams.get('clientId') ?? undefined,
        professionalId: searchParams.get('professionalId') ?? undefined,
        serviceId: searchParams.get('serviceId') ?? undefined,
      })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const clearPrefill = useCallback(() => setSalePrefill(null), [])

  if (salonLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  const goalPct = data.revenueGoal > 0 ? Math.min((data.revenueCurrent / data.revenueGoal) * 100, 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Desempenho e vendas da sua barbearia</p>
        </div>

        <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm">
          <button
            onClick={() => setFilter('dia')}
            className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
              filter === 'dia' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setFilter('mes')}
            className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
              filter === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Este mês
          </button>
        </div>

        <button
          onClick={() => setExporting(true)}
          className="flex items-center gap-2 border border-border-strong rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <Download size={15} />
          Exportar
        </button>
      </div>

      {/* Abas: visão geral e vendas */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('visao')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'visao'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Visão geral
        </button>
        <button
          onClick={() => setTab('vendas')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'vendas'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Vendas
        </button>
      </div>

      {tab === 'vendas' ? (
        <VendasSection
          salonId={salonId}
          period={filter}
          prefill={salePrefill}
          onPrefillConsumed={clearPrefill}
        />
      ) : (
        <>
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Cards de métrica com mini-gráfico animado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {CARD_CONFIG.map(({ key, label, icon: Icon, format }) => {
          const metric = data.metrics[key]
          const invert = key === 'cancelamentos'
          const bars = metric.spark.map((p, i) => ({
            label: String(p.x ?? i),
            value: p.y,
            highlight: i === metric.spark.length - 1,
          }))
          return (
            <StatsCard
              key={key}
              icon={<Icon size={15} />}
              label={label}
              value={loading ? 0 : metric.value}
              formattedValue={(n) => (format === 'currency' ? formatCurrency(n) : Math.round(n).toString())}
              badge={<ChangeBadge pct={metric.changePct} invert={invert} />}
              bars={bars}
              barColor={key === 'cancelamentos' ? 'bg-danger/25' : 'bg-primary/25'}
              barHighlightColor={key === 'cancelamentos' ? 'bg-danger' : 'bg-primary'}
            />
          )
        })}
      </div>

      {/* Gráfico de clientes + donut da meta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Total de clientes</h2>
            <p className="text-xs text-muted-foreground">Crescimento acumulado nos últimos 12 meses</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.clientsGrowth} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="clientsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--foreground)',
                  }}
                  labelStyle={{ color: 'var(--muted-foreground)' }}
                  formatter={(v) => [v as number, 'Clientes']}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-line)"
                  strokeWidth={2.5}
                  fill="url(#clientsFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Meta de faturamento</h2>
              <p className="text-xs text-muted-foreground">Mês atual</p>
            </div>
            <button
              onClick={() => setEditingGoal(true)}
              aria-label="Alterar meta de faturamento"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
            >
              <Pencil size={12} />
              Alterar
            </button>
          </div>
          <div className="relative flex-1 min-h-52 flex items-center justify-center">
            <RadialGoal percent={goalPct} size={176} />
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-medium text-foreground">
              {formatCurrency(data.revenueCurrent)}
              <span className="text-muted-foreground font-normal"> / {formatCurrency(data.revenueGoal)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Serviços mais vendidos */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Serviços mais vendidos</h2>
          <p className="text-xs text-muted-foreground">
            {filter === 'dia' ? 'Hoje' : 'Este mês'} · por faturamento
          </p>
        </div>

        {data.topServices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma venda registrada no período.
          </p>
        ) : (
          <div className="space-y-3">
            {data.topServices.map((s) => (
              <div key={s.nome} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-foreground truncate">{s.nome}</span>
                <div className="flex-1 h-2 rounded-full bg-chart-track overflow-hidden">
                  <div
                    className="h-full rounded-full bg-chart-line transition-all"
                    style={{ width: `${s.share}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm font-medium text-foreground">
                  {formatCurrency(s.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comissões do período */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Comissões</h2>
          <p className="text-xs text-muted-foreground">
            {filter === 'dia' ? 'Hoje' : 'Este mês'} · sobre serviços vendidos
          </p>
        </div>

        {data.commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma comissão no período (defina o percentual de comissão do profissional para calcular).
          </p>
        ) : (
          <div className="space-y-2">
            {data.commissions.map((c) => (
              <div
                key={c.professionalNome}
                className="flex items-center justify-between gap-3 bg-surface-2 rounded-lg px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{c.professionalNome}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.percentual.toFixed(0)}% sobre {formatCurrency(c.base)} em serviços
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(c.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Faturamento considera comandas fechadas; clientes atendidos considera agendamentos concluídos. As
        variações comparam com {filter === 'dia' ? 'ontem' : 'o mês anterior'}.
      </p>
        </>
      )}

      {exporting && <ExportReportModal salonId={salonId} onClose={() => setExporting(false)} />}

      {editingGoal && (
        <EditGoalModal
          salonId={salonId}
          currentGoal={data.revenueGoal}
          onClose={() => setEditingGoal(false)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
