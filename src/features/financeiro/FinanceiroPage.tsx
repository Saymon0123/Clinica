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
  PartyPopper,
  HandCoins,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Target,
} from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useFinanceiroData, type MetricKey, type PeriodFilter } from './useFinanceiroData'
import { StatsCard } from '../../components/StatsCard'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonPagina } from '../../components/Skeleton'
import { RadialGoal } from '../../components/RadialGoal'
import { PageHeader } from '../../components/PageHeader'
import { VendasSection } from '../vendas/VendasSection'
import { FechamentoComissaoModal } from './FechamentoComissaoModal'
import { CaixaSection } from './CaixaSection'
import type { SalePrefill } from '../vendas/NewSaleModal'
import { EditGoalModal } from './EditGoalModal'
import { ExportReportModal } from './ExportReportModal'
import { GoalReachedModal } from './GoalReachedModal'
import { ErroInline } from '../../components/ErroInline'

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** 'YYYY-MM' do mês corrente. */
function mesCorrente() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function somaMes(refMonth: string, delta: number) {
  const [ano, mes] = refMonth.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function labelDoMes(refMonth: string) {
  const [ano, mes] = refMonth.split('-').map(Number)
  return `${MESES_LABEL[mes - 1]} ${ano}`
}

const CARD_CONFIG: { key: MetricKey; label: string; icon: typeof DollarSign; format: 'currency' | 'number' }[] = [
  { key: 'faturamento', label: 'Faturamento', icon: DollarSign, format: 'currency' },
  { key: 'clientesAtendidos', label: 'Clientes atendidos', icon: Users, format: 'number' },
  { key: 'agendamentos', label: 'Agendamentos', icon: CalendarCheck, format: 'number' },
  { key: 'cancelamentos', label: 'Cancelamentos', icon: CalendarX, format: 'number' },
]

function ChangeBadge({
  pct,
  invert,
  emHero,
}: {
  pct: number | null
  invert?: boolean
  /** Sobre o card preenchido, verde/vermelho some no fundo: vira pílula clara. */
  emHero?: boolean
}) {
  if (pct === null) return null
  const positive = invert ? pct < 0 : pct >= 0
  const Icon = pct >= 0 ? TrendingUp : TrendingDown
  return (
    <span
      title={invert ? 'Aqui, queda é bom: verde significa menos cancelamentos que no período anterior.' : undefined}
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        emHero
          ? 'bg-primary-foreground/15 text-primary-foreground rounded-full px-2 py-0.5'
          : positive
            ? 'text-success'
            : 'text-danger'
      }`}
    >
      <Icon size={14} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export function FinanceiroPage() {
  const { salonId, isManager, loading: salonLoading } = useSalon()
  const [filter, setFilter] = useState<PeriodFilter>('mes')
  const [refMonth, setRefMonth] = useState(mesCorrente)
  const ehMesCorrente = refMonth === mesCorrente()
  // "Este mês" quando é o corrente; "ago 2026" quando navegou para trás.
  const rotuloPeriodo = filter === 'dia' ? 'Hoje' : ehMesCorrente ? 'Este mês' : labelDoMes(refMonth)
  const { data, loading, error, reload } = useFinanceiroData(salonId, filter, refMonth)
  const [editingGoal, setEditingGoal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [fechamentoAberto, setFechamentoAberto] = useState(false)

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

  // Sem meta definida não há "meta atingida": o padrão de R$ 3.000 é só um
  // placeholder e comemorar contra ele seria mentira.
  const metaAtingida = data.goalDefinida && data.revenueGoal > 0 && data.revenueCurrent >= data.revenueGoal

  // Chip do caixa no cabeçalho: a ação operacional do dia não deveria exigir
  // rolar a página inteira para saber se o caixa está aberto.
  const [caixaAbertoDesde, setCaixaAbertoDesde] = useState<string | null>(null)
  useEffect(() => {
    if (!salonId || !isManager) return
    let ativo = true
    const carregarCaixa = async () => {
      const { data: cx } = await supabase
        .from('cash_registers')
        .select('aberto_em')
        .eq('salon_id', salonId)
        .eq('status', 'aberto')
        .order('aberto_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ativo) setCaixaAbertoDesde(cx?.aberto_em ?? null)
    }
    carregarCaixa()
    const channel = supabase
      .channel(`caixa_chip_${salonId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_registers', filter: `salon_id=eq.${salonId}` },
        carregarCaixa,
      )
      .subscribe()
    return () => {
      ativo = false
      supabase.removeChannel(channel)
    }
  }, [salonId, isManager])

  // Comemora uma única vez por mês, assim que a meta é batida — só no mês
  // corrente: revisitar julho não deve estourar confete de novo.
  useEffect(() => {
    if (loading || !metaAtingida || !salonId || !isManager || !ehMesCorrente) return
    const mesAtual = new Date().toISOString().slice(0, 7)
    const chave = `crm_meta_celebrada_${salonId}_${mesAtual}`
    if (localStorage.getItem(chave)) return
    localStorage.setItem(chave, '1')
    setShowCelebration(true)
  }, [loading, metaAtingida, salonId, isManager])

  const clearPrefill = useCallback(() => setSalePrefill(null), [])

  if (salonLoading) {
    return <SkeletonPagina />
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
    // valores-alinhados: a tela inteira e numero empilhado (KPIs, comissoes,
    // caixa, top servicos) — digito de largura fixa evita a coluna "dancar".
    <div className="valores-alinhados space-y-5">
      <PageHeader
        titulo="Financeiro"
        subtitulo={isManager ? 'Desempenho e vendas da sua barbearia' : 'Seus atendimentos e sua comissão'}
        acoes={<>
        <div className="inline-flex items-center rounded-lg bg-surface-2 border border-border p-1 text-sm">
          <button
            onClick={() => {
              setFilter('dia')
              setRefMonth(mesCorrente())
            }}
            className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
              filter === 'dia' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Hoje
          </button>
          <div
            className={`inline-flex items-center rounded-md transition-colors ${
              filter === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <button
              onClick={() => {
                setFilter('mes')
                setRefMonth((m) => somaMes(m, -1))
              }}
              aria-label="Mês anterior"
              className="px-1.5 py-1.5 hover:text-foreground"
            >
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setFilter('mes')} className="px-1 py-1.5 font-medium min-w-20 text-center">
              {filter === 'mes' ? rotuloPeriodo : ehMesCorrente ? 'Este mês' : labelDoMes(refMonth)}
            </button>
            <button
              onClick={() => {
                setFilter('mes')
                setRefMonth((m) => somaMes(m, 1))
              }}
              disabled={ehMesCorrente}
              aria-label="Próximo mês"
              className="px-1.5 py-1.5 hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={() => {
                setTab('visao')
                document.getElementById('caixa')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              title={
                caixaAbertoDesde
                  ? 'Ir para o caixa'
                  : 'O caixa abre sozinho na primeira venda do dia'
              }
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                caixaAbertoDesde
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-border-strong text-muted-foreground hover:bg-surface-2'
              }`}
            >
              <Wallet size={16} />
              {caixaAbertoDesde
                ? `Caixa aberto · ${new Date(caixaAbertoDesde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Caixa · abre na 1ª venda'}
            </button>
          )}
          {isManager && (
            <button
              onClick={() => setExporting(true)}
              className="flex items-center gap-2 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Download size={16} />
              Exportar
            </button>
          )}
        </div>
        </>}
      />

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

      {/* key={tab} remonta o wrapper na troca e dispara a entrada animada. */}
      <div key={tab} className="aba-entra space-y-5">
      {tab === 'vendas' ? (
        <VendasSection
          salonId={salonId}
          period={filter}
          refMonth={refMonth}
          periodLabel={rotuloPeriodo}
          prefill={salePrefill}
          onPrefillConsumed={clearPrefill}
        />
      ) : (
        <>
      <ErroInline>{error}</ErroInline>

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
              icon={<Icon size={16} />}
              label={label}
              value={loading ? 0 : metric.value}
              formattedValue={(n) => (format === 'currency' ? formatCurrency(n) : Math.round(n).toString())}
              badge={<ChangeBadge pct={metric.changePct} invert={invert} emHero={key === 'faturamento'} />}
              bars={bars}
              hero={key === 'faturamento'}
              barColor={
                key === 'faturamento'
                  ? 'bg-primary-foreground/25'
                  : key === 'cancelamentos'
                    ? 'bg-danger/25'
                    : 'bg-primary/25'
              }
              barHighlightColor={
                key === 'faturamento'
                  ? 'bg-primary-foreground'
                  : key === 'cancelamentos'
                    ? 'bg-danger'
                    : 'bg-primary'
              }
            />
          )
        })}
      </div>

      {/* Gráfico de clientes + donut da meta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${isManager ? 'lg:col-span-2' : 'lg:col-span-3'} bg-surface border border-border rounded-2xl shadow-sm p-5`}>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Novos clientes</h2>
            <p className="text-xs text-muted-foreground">Cadastros por mês nos últimos 12 meses</p>
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
                  formatter={(v, _nome, item) => [
                    `${v as number} (total: ${(item?.payload as { total?: number })?.total ?? '—'})`,
                    'Novos',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="novos"
                  stroke="var(--chart-line)"
                  strokeWidth={2.5}
                  fill="url(#clientsFill)"
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {isManager && (
        <div className="bg-surface border border-border rounded-2xl shadow-sm p-5 flex flex-col">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Meta de faturamento</h2>
              <p className="text-xs text-muted-foreground">
                {filter === 'mes' && !ehMesCorrente ? labelDoMes(refMonth) : 'Mês atual'}
              </p>
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
          {!data.goalDefinida ? (
            <div className="flex-1 min-h-52 flex flex-col items-center justify-center gap-3 text-center">
              <Target size={32} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-48">
                Você ainda não definiu uma meta mensal de faturamento.
              </p>
              <button
                onClick={() => setEditingGoal(true)}
                className="btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                Definir meta
              </button>
            </div>
          ) : (
            <>
          <div className="relative flex-1 min-h-52 flex items-center justify-center">
            <RadialGoal percent={goalPct} size={176} />
          </div>
          <div className="mt-3 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              {formatCurrency(data.revenueCurrent)}
              <span className="text-muted-foreground font-normal"> / {formatCurrency(data.revenueGoal)}</span>
            </p>
            {metaAtingida && (
              <button
                onClick={() => setShowCelebration(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success"
              >
                <PartyPopper size={14} />
                Meta atingida!
              </button>
            )}
          </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* Serviços mais vendidos */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Serviços mais vendidos</h2>
          <p className="text-xs text-muted-foreground">{rotuloPeriodo} · por faturamento</p>
        </div>

        {data.topServices.length === 0 ? (
          <EstadoVazio
            icone={TrendingUp}
            titulo="Nenhuma venda registrada no período."
            descricao="Quando houver vendas, os serviços que mais faturam aparecem aqui."
          />
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
                <span className="w-32 shrink-0 text-right text-sm font-medium text-foreground">
                  {formatCurrency(s.revenue)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {s.share.toFixed(0)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isManager && (
        <div id="caixa">
          <CaixaSection salonId={salonId} />
        </div>
      )}

      {/* Comissões do período */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Comissões</h2>
            <p className="text-xs text-muted-foreground">{rotuloPeriodo} · sobre serviços vendidos</p>
          </div>
          {isManager && (
            <button
              onClick={() => setFechamentoAberto(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <HandCoins size={14} />
              Fechar comissões
            </button>
          )}
        </div>

        {data.commissions.length === 0 ? (
          <EstadoVazio
            icone={HandCoins}
            titulo="Nenhuma comissão no período"
            descricao="Defina o percentual de comissão do profissional para calcular."
          />
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
        variações comparam com {filter === 'dia' ? 'ontem' : 'o mês anterior ao exibido'}.
      </p>
        </>
      )}
      </div>

      {showCelebration && (
        <GoalReachedModal
          revenue={data.revenueCurrent}
          goal={data.revenueGoal}
          onClose={() => setShowCelebration(false)}
        />
      )}

      {exporting && <ExportReportModal salonId={salonId} onClose={() => setExporting(false)} />}

      {fechamentoAberto && salonId && (
        <FechamentoComissaoModal salonId={salonId} onClose={() => setFechamentoAberto(false)} />
      )}

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
