import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { buildCsv, downloadCsv } from '../../lib/csv'
import { PAYMENT_LABELS } from '../vendas/types'

type Range = 'semana' | 'mes'

type OrderRow = {
  id: string
  created_at: string
  closed_at: string | null
  clients: { nome: string } | { nome: string }[] | null
  professionals: { nome: string } | { nome: string }[] | null
  payments: { forma_pagamento: string; valor: number }[]
  order_items: {
    tipo: string
    quantidade: number
    preco_unitario: number
    services: { nome: string } | { nome: string }[] | null
    products: { nome: string } | { nome: string }[] | null
  }[]
}

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function startOf(range: Range): Date {
  const now = new Date()
  if (range === 'semana') {
    const d = new Date(now)
    // Semana começando na segunda-feira.
    const weekday = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - weekday)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
}

export function ExportReportModal({ salonId, onClose }: { salonId: string; onClose: () => void }) {
  const [range, setRange] = useState<Range>('mes')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setBusy(true)
    setError(null)

    const start = startOf(range)
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, created_at, closed_at, clients(nome), professionals(nome), payments(forma_pagamento, valor), order_items(tipo, quantidade, preco_unitario, services(nome), products(nome))',
      )
      .eq('salon_id', salonId)
      .eq('status', 'fechada')
      .gte('closed_at', start.toISOString())
      .order('closed_at', { ascending: true })

    setBusy(false)

    if (fetchError) {
      console.error('Erro ao exportar relatório:', fetchError)
      setError('Não foi possível gerar o relatório. Tente novamente.')
      return
    }

    const orders = (data ?? []) as unknown as OrderRow[]
    if (orders.length === 0) {
      setError(`Nenhuma venda registrada ${range === 'semana' ? 'nesta semana' : 'neste mês'}.`)
      return
    }

    // Uma linha por item vendido, para o relatório servir de base de análise.
    const rows: unknown[][] = []
    for (const o of orders) {
      const data_venda = o.closed_at ?? o.created_at
      const pagamento = o.payments[0]?.forma_pagamento
      for (const item of o.order_items) {
        const nomeItem =
          item.tipo === 'servico' ? one(item.services)?.nome : one(item.products)?.nome
        rows.push([
          new Date(data_venda).toLocaleDateString('pt-BR'),
          new Date(data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          one(o.clients)?.nome ?? '',
          one(o.professionals)?.nome ?? '',
          item.tipo === 'servico' ? 'Serviço' : 'Produto',
          nomeItem ?? '',
          item.quantidade,
          Number(item.preco_unitario).toFixed(2).replace('.', ','),
          (item.quantidade * Number(item.preco_unitario)).toFixed(2).replace('.', ','),
          pagamento ? (PAYMENT_LABELS[pagamento] ?? pagamento) : '',
        ])
      }
    }

    const total = orders.reduce(
      (acc, o) => acc + o.order_items.reduce((a, i) => a + i.quantidade * Number(i.preco_unitario), 0),
      0,
    )
    rows.push([])
    rows.push(['', '', '', '', '', '', '', 'TOTAL', total.toFixed(2).replace('.', ','), ''])

    const csv = buildCsv(
      [
        'Data',
        'Hora',
        'Cliente',
        'Profissional',
        'Tipo',
        'Item',
        'Qtd',
        'Preço unit.',
        'Subtotal',
        'Pagamento',
      ],
      rows,
    )

    const hoje = new Date().toISOString().slice(0, 10)
    downloadCsv(`financeiro-${range}-${hoje}.csv`, csv)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Exportar relatório</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground">Período</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              onClick={() => setRange('semana')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                range === 'semana'
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border-strong text-foreground hover:bg-surface-2'
              }`}
            >
              Esta semana
            </button>
            <button
              onClick={() => setRange('mes')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                range === 'mes'
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border-strong text-foreground hover:bg-surface-2'
              }`}
            >
              Este mês
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Gera um arquivo CSV (abre no Excel) com uma linha por item vendido: data, cliente,
          profissional, serviço/produto, valores e forma de pagamento.
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          onClick={handleExport}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Download size={15} />
          {busy ? 'Gerando...' : 'Baixar relatório'}
        </button>
      </div>
    </div>
  )
}
