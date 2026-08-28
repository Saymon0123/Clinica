import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, TrendingUp, Users, CalendarDays, Receipt, CalendarX } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { NovaUnidadeModal } from './NovaUnidadeModal'
import { Badge } from '../../components/Badge'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonLinhas } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import { useSalon } from '../auth/useSalon'
import { useProducaoBarbeiros } from './useProducaoBarbeiros'
import { useRedeData, type Periodo } from './useRedeData'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Mesma janela usada pelo comparativo, para os números baterem entre si. */
function inicioDoPeriodoISO(periodo: Periodo) {
  const d = new Date()
  if (periodo === 'semana') d.setDate(d.getDate() - d.getDay())
  else d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function RedePage() {
  const { unidades, organizationId, salonId, isOwner, isNetwork, recarregarUnidades, selecionarUnidade } =
    useSalon()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [modalAberto, setModalAberto] = useState(false)
  const navigate = useNavigate()

  // A rede é do dono: unidades onde ele é só gerente não entram no comparativo.
  const gerenciadas = unidades.filter((u) => u.role === 'owner')
  const { resumos, serieDiaria, loading, erro, recarregar } = useRedeData(gerenciadas, periodo)
  const desdeISO = inicioDoPeriodoISO(periodo)
  const { producao, erro: erroProducao } = useProducaoBarbeiros(gerenciadas, desdeISO)

  // Sem barbearia escolhida o contexto não tem organizationId; nesse caso a
  // rede é a das unidades que ele administra.
  const redeId = organizationId ?? gerenciadas.find((u) => u.organizationId)?.organizationId ?? null

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        O painel da rede é do dono. Sua conta administra uma unidade específica.
      </p>
    )
  }

  if (!isNetwork && gerenciadas.length <= 1 && !redeId) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta página é para barbearias em rede. Sua conta administra apenas uma unidade.
      </p>
    )
  }

  const totalFaturamento = resumos.reduce((s, r) => s + r.faturamento, 0)
  const totalAgendamentos = resumos.reduce((s, r) => s + r.agendamentos, 0)
  const totalClientes = resumos.reduce((s, r) => s + r.clientesNovos, 0)
  const totalVendas = resumos.reduce((s, r) => s + r.vendas, 0)
  const totalCancelamentos = resumos.reduce((s, r) => s + r.cancelamentos, 0)
  const ticketRede = totalVendas > 0 ? totalFaturamento / totalVendas : 0
  const taxaCancelamento =
    totalAgendamentos + totalCancelamentos > 0
      ? (totalCancelamentos / (totalAgendamentos + totalCancelamentos)) * 100
      : 0
  const melhor = resumos[0]

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Rede"
        subtitulo={`Visão somada das ${gerenciadas.length} unidades que você administra`}
        acoes={<>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['semana', 'mes'] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  periodo === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-2'
                }`}
              >
                {p === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          {redeId && (
            <button
              onClick={() => setModalAberto(true)}
              className="flex items-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Plus size={16} />
              Nova unidade
            </button>
          )}
      </>}
      />

      {(erro || erroProducao) && <p className="text-sm text-danger">{erro ?? erroProducao}</p>}

      {/* Totais da rede */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp size={14} />
            Faturamento
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{moeda(totalFaturamento)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Receipt size={14} />
            Ticket médio
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{moeda(ticketRede)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays size={14} />
            Agendamentos
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{totalAgendamentos}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users size={14} />
            Clientes novos
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{totalClientes}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarX size={14} />
            Cancelamento
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">
            {taxaCancelamento.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Evolução do faturamento da rede */}
        <div className="bg-surface border border-border rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Faturamento por dia</h2>
          <p className="text-xs text-muted-foreground mb-3">Rede inteira somada</p>
          {serieDiaria.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem vendas no período.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieDiaria} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(v) => moeda(Number(v) || 0)}
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="total" stroke="var(--chart-line)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Faturamento por unidade */}
        <div className="bg-surface border border-border rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Faturamento por unidade</h2>
          <p className="text-xs text-muted-foreground mb-3">Quem puxa o resultado da rede</p>
          {resumos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem dados no período.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumos} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(v) => moeda(Number(v) || 0)}
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="faturamento" radius={[6, 6, 0, 0]}>
                    {resumos.map((r) => (
                      <Cell
                        key={r.salonId}
                        fill="var(--chart-line)"
                        fillOpacity={r.salonId === salonId ? 1 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Comparativo entre unidades */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Comparativo por unidade</h2>
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonLinhas />
          </div>
        ) : resumos.length === 0 ? (
          <EstadoVazio icone={Building2} titulo="Nenhuma unidade para comparar." />
        ) : (
          <div className="divide-y divide-border">
            {resumos.map((r) => {
              const proporcao = melhor && melhor.faturamento > 0 ? (r.faturamento / melhor.faturamento) * 100 : 0
              return (
                <div key={r.salonId} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={16} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{r.nome}</span>
                      {r.salonId === salonId && <Badge variante="marca">atual</Badge>}
                      {!r.ativo && <Badge variante="neutro">desativada</Badge>}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{moeda(r.faturamento)}</span>
                  </div>

                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${proporcao}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {r.vendas} venda{r.vendas === 1 ? '' : 's'} · ticket {moeda(r.ticketMedio)} ·{' '}
                      {r.agendamentos} agendamento{r.agendamentos === 1 ? '' : 's'} ·{' '}
                      {r.cancelamentos} cancelado{r.cancelamentos === 1 ? '' : 's'} ·{' '}
                      {r.clientesNovos} cliente{r.clientesNovos === 1 ? '' : 's'} novo
                      {r.clientesNovos === 1 ? '' : 's'}
                    </span>
                    {r.salonId !== salonId && (
                      <button
                        onClick={() => {
                          // Trocar a unidade E ir para a agenda dela — só
                          // trocar deixava a tela igual, parecendo que o
                          // clique não fez nada.
                          selecionarUnidade(r.salonId)
                          navigate('/')
                        }}
                        className="font-medium text-primary hover:underline"
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Produção por barbeiro, somando a rede inteira */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Produção por barbeiro</h2>
          <p className="text-xs text-muted-foreground">Quem mais produz na rede, em todas as unidades</p>
        </div>

        {producao.length === 0 ? (
          <EstadoVazio icone={Users} titulo="Nenhum barbeiro com venda no período." />
        ) : (
          <div className="divide-y divide-border">
            {producao.map((b) => {
              const topo = producao[0].faturamento
              const proporcao = topo > 0 ? (b.faturamento / topo) * 100 : 0
              return (
                <div key={b.professionalId} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{b.nome}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">{b.unidade}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{moeda(b.faturamento)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${proporcao}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.atendimentos} item{b.atendimentos === 1 ? '' : 's'} vendido
                    {b.atendimentos === 1 ? '' : 's'} · ticket {moeda(b.ticketMedio)} · comissão{' '}
                    {moeda(b.comissao)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalAberto && salonId && (
        <NovaUnidadeModal
          salonId={salonId}
          primeiraUnidade={!organizationId}
          onClose={() => setModalAberto(false)}
          onCriada={async () => {
            await recarregarUnidades()
            await recarregar()
          }}
        />
      )}
    </div>
  )
}
