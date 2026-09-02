import { useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { useVendasData } from './useVendasData'
import { NewSaleModal, type SalePrefill } from './NewSaleModal'
import { PAYMENT_LABELS } from './types'
import { Tabela, Th, Linha, Td } from '../../components/Tabela'
import { EstadoVazio } from '../../components/EstadoVazio'
import { ErroInline } from '../../components/ErroInline'

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
  onVendaSalva,
}: {
  salonId: string
  period: 'dia' | 'mes'
  /** 'YYYY-MM' do mês exibido; omitido = mês corrente. */
  refMonth?: string
  periodLabel?: string
  prefill?: SalePrefill | null
  onPrefillConsumed?: () => void
  /** Chamado quando uma venda é efetivamente salva — é o único momento em que
   *  a cobrança pendente deixa de existir (ver lib/vendaPendente). */
  onVendaSalva?: () => void
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
          className="flex items-center gap-2 btn-primary rounded-full px-5 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          Nova venda
        </button>
      </div>

      <ErroInline>{error}</ErroInline>

      {!loading && sales.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl shadow-sm">
          <EstadoVazio
            icone={Receipt}
            titulo={`Nenhuma venda registrada ${period === 'dia' ? 'hoje' : 'neste mês'}.`}
            descricao="Registre a primeira venda para o faturamento aparecer na visão geral."
          />
        </div>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Cliente</Th>
              <Th>Profissional</Th>
              <Th>Pagamento</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <Linha key={s.id}>
                <Td className="text-foreground whitespace-nowrap">
                  {formatDateTime(s.closed_at ?? s.created_at)}
                </Td>
                <Td className="text-foreground">{s.client_nome ?? '—'}</Td>
                <Td className="text-muted-foreground">
                  {s.professional_nome ?? '—'}
                </Td>
                <Td className="text-muted-foreground">
                  {s.forma_pagamento ? (PAYMENT_LABELS[s.forma_pagamento] ?? s.forma_pagamento) : '—'}
                </Td>
                <Td className="text-right font-medium text-foreground">{formatCurrency(s.total)}</Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}

      {modalOpen && (
        <NewSaleModal
          salonId={salonId}
          prefill={activePrefill ?? undefined}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            // A venda existe: a pendência morre aqui, e só aqui.
            onVendaSalva?.()
            reload()
          }}
        />
      )}
    </div>
  )
}
