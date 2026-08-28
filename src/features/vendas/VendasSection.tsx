import { useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { useVendasData } from './useVendasData'
import { NewSaleModal, type SalePrefill } from './NewSaleModal'
import { PAYMENT_LABELS } from './types'

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VendasSection({
  salonId,
  period,
  refMonth,
  periodLabel,
  prefill,
  onPrefillConsumed,
}: {
  salonId: string
  period: 'dia' | 'mes'
  /** 'YYYY-MM' do mês exibido; omitido = mês corrente. */
  refMonth?: string
  periodLabel?: string
  prefill?: SalePrefill | null
  onPrefillConsumed?: () => void
}) {
  const { sales, loading, error, reload } = useVendasData(salonId, period, refMonth)
  const [modalOpen, setModalOpen] = useState(false)
  const [activePrefill, setActivePrefill] = useState<SalePrefill | null>(null)

  // Abre a venda já preenchida quando vem do "Concluir e cobrar" da agenda.
  useEffect(() => {
    if (prefill) {
      setActivePrefill(prefill)
      setModalOpen(true)
      onPrefillConsumed?.()
    }
  }, [prefill, onPrefillConsumed])

  const totalPeriod = sales.reduce((acc, s) => acc + s.total, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {periodLabel ?? (period === 'dia' ? 'Hoje' : 'Este mês')} · {sales.length} venda{sales.length === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-foreground">{formatCurrency(totalPeriod)}</span>
        </p>

        <button
          onClick={() => {
            setActivePrefill(null)
            setModalOpen(true)
          }}
          className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          Nova venda
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && sales.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl shadow-sm p-10 text-center">
          <Receipt size={32} className="mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhuma venda registrada {period === 'dia' ? 'hoje' : 'neste mês'}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Registre a primeira venda para o faturamento aparecer na visão geral.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Profissional</th>
                <th className="px-4 py-3 font-medium">Pagamento</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 text-foreground whitespace-nowrap">
                    {formatDateTime(s.closed_at ?? s.created_at)}
                  </td>
                  <td className="px-4 py-3 text-foreground">{s.client_nome ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.professional_nome ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.forma_pagamento ? (PAYMENT_LABELS[s.forma_pagamento] ?? s.forma_pagamento) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NewSaleModal
          salonId={salonId}
          prefill={activePrefill ?? undefined}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}
