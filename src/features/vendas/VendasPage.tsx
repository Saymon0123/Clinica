import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Receipt } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
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

export function VendasPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [period, setPeriod] = useState<'dia' | 'mes'>('dia')
  const { sales, loading, error, reload } = useVendasData(salonId, period)

  const [searchParams, setSearchParams] = useSearchParams()
  const [modalPrefill, setModalPrefill] = useState<SalePrefill | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Se veio da agenda ("concluir e cobrar"), abre o modal pré-preenchido
  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (appointmentId) {
      setModalPrefill({
        appointmentId,
        clientId: searchParams.get('clientId') ?? undefined,
        professionalId: searchParams.get('professionalId') ?? undefined,
        serviceId: searchParams.get('serviceId') ?? undefined,
      })
      setModalOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

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

  const totalPeriod = sales.reduce((acc, s) => acc + s.total, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {period === 'dia' ? 'Hoje' : 'Este mês'} · {sales.length} venda{sales.length === 1 ? '' : 's'} ·{' '}
            {formatCurrency(totalPeriod)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm">
            <button
              onClick={() => setPeriod('dia')}
              className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                period === 'dia' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('mes')}
              className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                period === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Este mês
            </button>
          </div>

          <button
            onClick={() => {
              setModalPrefill(null)
              setModalOpen(true)
            }}
            className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Nova venda
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && sales.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center">
          <Receipt size={32} className="mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhuma venda registrada {period === 'dia' ? 'hoje' : 'neste mês'}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Registre a primeira venda para o faturamento aparecer no Financeiro.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Profissional</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Pagamento</th>
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
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {s.professional_nome ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
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
          prefill={modalPrefill ?? undefined}
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
