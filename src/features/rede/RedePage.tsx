import { useState, type FormEvent } from 'react'
import { Building2, Plus, TrendingUp, Users, CalendarDays, Receipt, CalendarX, X } from 'lucide-react'
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
import { useSalon } from '../auth/useSalon'
import { useProducaoBarbeiros } from './useProducaoBarbeiros'
import { invokeFunction } from '../../lib/invokeFunction'
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
  const CORES = ['#7c3aed', '#a78bfa', '#c4b5fd', '#8b5cf6', '#ddd6fe']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Rede</h1>
          <p className="text-sm text-muted-foreground">
            Visão somada das {gerenciadas.length} unidades que você administra
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              className="flex items-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium"
            >
              <Plus size={15} />
              Nova unidade
            </button>
          )}
        </div>
      </div>

      {(erro || erroProducao) && <p className="text-sm text-danger">{erro ?? erroProducao}</p>}

      {/* Totais da rede */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp size={14} />
            Faturamento
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{moeda(totalFaturamento)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Receipt size={14} />
            Ticket médio
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{moeda(ticketRede)}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays size={14} />
            Agendamentos
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{totalAgendamentos}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users size={14} />
            Clientes novos
          </div>
          <div className="text-xl font-semibold text-foreground mt-1">{totalClientes}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
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
        <div className="bg-surface border border-border rounded-xl p-5">
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
                  <Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Faturamento por unidade */}
        <div className="bg-surface border border-border rounded-xl p-5">
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
                    {resumos.map((r, i) => (
                      <Cell key={r.salonId} fill={CORES[i % CORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Comparativo entre unidades */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Comparativo por unidade</h2>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground p-4">Carregando...</p>
        ) : resumos.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma unidade para comparar.</p>
        ) : (
          <div className="divide-y divide-border">
            {resumos.map((r) => {
              const proporcao = melhor && melhor.faturamento > 0 ? (r.faturamento / melhor.faturamento) * 100 : 0
              return (
                <div key={r.salonId} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={15} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{r.nome}</span>
                      {r.salonId === salonId && (
                        <span className="text-[11px] rounded-full bg-primary-soft text-primary-soft-foreground px-2 py-0.5 shrink-0">
                          atual
                        </span>
                      )}
                      {!r.ativo && (
                        <span className="text-[11px] rounded-full bg-surface-2 text-muted-foreground px-2 py-0.5 shrink-0">
                          desativada
                        </span>
                      )}
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
                        onClick={() => selecionarUnidade(r.salonId)}
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
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Produção por barbeiro</h2>
          <p className="text-xs text-muted-foreground">Quem mais produz na rede, em todas as unidades</p>
        </div>

        {producao.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">
            Nenhum barbeiro com venda no período.
          </p>
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

      {modalAberto && redeId && (
        <NovaUnidadeModal
          organizationId={redeId}
          catalogoDe={salonId}
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

function NovaUnidadeModal({
  organizationId,
  catalogoDe,
  onClose,
  onCriada,
}: {
  organizationId: string
  catalogoDe: string | null
  onClose: () => void
  onCriada: () => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [telefone, setTelefone] = useState('')
  const [copiarCatalogo, setCopiarCatalogo] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe o nome da unidade.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { error } = await invokeFunction(
      'add-salon-unit',
      {
        body: {
          organizationId,
          nome: nome.trim(),
          endereco: endereco.trim(),
          telefone: telefone.trim(),
          copiarCatalogoDe: copiarCatalogo && catalogoDe ? catalogoDe : undefined,
        },
      },
      'Não foi possível criar a unidade.',
    )
    setSalvando(false)

    if (error) {
      setErro(error)
      return
    }
    await onCriada()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 size={18} />
            Nova unidade
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={criar} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nome da unidade</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Ex: Unidade Centro"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Endereço</span>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Telefone</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          {catalogoDe && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={copiarCatalogo}
                onChange={(e) => setCopiarCatalogo(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Copiar os serviços da unidade atual</span>
            </label>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar unidade'}
          </button>
          <p className="text-xs text-muted-foreground">
            Você entra como dono da nova unidade. Os barbeiros são convidados depois, pela aba Equipe.
          </p>
        </form>
      </div>
    </div>
  )
}
