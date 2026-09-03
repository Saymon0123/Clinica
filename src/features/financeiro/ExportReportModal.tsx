import { useState } from 'react'
import { Download } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { buildCsv, downloadCsv } from '../../lib/csv'
import { PAYMENT_LABELS } from '../vendas/types'
import { ErroInline } from '../../components/ErroInline'
import { intervaloDoRelatorio, type PeriodoDoRelatorio } from './periodoDoRelatorio'
import type { PeriodFilter } from './useFinanceiroData'

type OrderRow = {
  id: string
  created_at: string
  closed_at: string | null
  clients: { nome: string } | { nome: string }[] | null
  professionals: { nome: string } | { nome: string }[] | null
  payments: { forma_pagamento: string; valor: number }[]
  pacotes_do_cliente: { pacotes: { nome: string } | { nome: string }[] | null }[] | null
  order_items: {
    tipo: string
    quantidade: number
    preco_unitario: number
    services: { nome: string } | { nome: string }[] | null
    products: { nome: string } | { nome: string }[] | null
  }[]
}

const TIPO_LABELS: Record<string, string> = {
  servico: 'Serviço',
  produto: 'Produto',
  pacote: 'Pacote',
}

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function dinheiro(v: number) {
  return v.toFixed(2).replace('.', ',')
}

/**
 * Exporta o período que está na TELA (achado 39 da revisão de 01/09): o mês
 * navegado, ou hoje, ou esta semana — e o arquivo diz qual no nome.
 */
export function ExportReportModal({
  salonId,
  refMonth,
  filtro,
  onClose,
}: {
  salonId: string
  /** 'YYYY-MM' do mês exibido na página. */
  refMonth: string
  /** O filtro da página escolhe a opção inicial. */
  filtro: PeriodFilter
  onClose: () => void
}) {
  const [periodo, setPeriodo] = useState<PeriodoDoRelatorio>(filtro === 'dia' ? 'dia' : 'mes')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const intervalo = intervaloDoRelatorio(periodo, refMonth)
  const rotuloDoMes = intervaloDoRelatorio('mes', refMonth).rotulo.replace(/^em /, '')

  async function handleExport() {
    setBusy(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, created_at, closed_at, clients(nome), professionals(nome), payments(forma_pagamento, valor), pacotes_do_cliente(pacotes(nome)), order_items(tipo, quantidade, preco_unitario, services(nome), products(nome))',
      )
      .eq('salon_id', salonId)
      .eq('status', 'fechada')
      .gte('closed_at', intervalo.inicio.toISOString())
      .lt('closed_at', intervalo.fim.toISOString())
      .order('closed_at', { ascending: true })

    setBusy(false)

    if (fetchError) {
      console.error('Erro ao exportar relatório:', fetchError)
      setError('Não foi possível gerar o relatório. Tente novamente.')
      return
    }

    const orders = (data ?? []) as unknown as OrderRow[]
    if (orders.length === 0) {
      setError(`Nenhuma venda registrada ${intervalo.rotulo}.`)
      return
    }

    // Uma linha por item vendido, para o relatório servir de base de análise.
    const rows: unknown[][] = []
    for (const o of orders) {
      const data_venda = o.closed_at ?? o.created_at
      // Pagamento dividido (achado 41) sai por extenso: "Pix 30,00 + Dinheiro 20,00".
      const pagamento =
        o.payments.length > 1
          ? o.payments
              .map((p) => `${PAYMENT_LABELS[p.forma_pagamento] ?? p.forma_pagamento} ${dinheiro(Number(p.valor))}`)
              .join(' + ')
          : (o.payments[0] ? (PAYMENT_LABELS[o.payments[0].forma_pagamento] ?? o.payments[0].forma_pagamento) : '')
      // Item de pacote não guarda o modelo em order_items; o nome vem do
      // crédito criado pela venda, na ordem em que foi criado.
      const nomesDePacote = (o.pacotes_do_cliente ?? []).map((p) => one(p.pacotes)?.nome ?? '').filter(Boolean)
      let pacotesUsados = 0
      for (const item of o.order_items) {
        let nomeItem =
          item.tipo === 'servico' ? one(item.services)?.nome : one(item.products)?.nome
        if (!nomeItem && item.tipo === 'pacote') nomeItem = nomesDePacote[pacotesUsados++] ?? 'Pacote'
        rows.push([
          new Date(data_venda).toLocaleDateString('pt-BR'),
          new Date(data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          one(o.clients)?.nome ?? '',
          one(o.professionals)?.nome ?? '',
          TIPO_LABELS[item.tipo] ?? item.tipo,
          nomeItem ?? '',
          item.quantidade,
          dinheiro(Number(item.preco_unitario)),
          dinheiro(item.quantidade * Number(item.preco_unitario)),
          pagamento,
        ])
      }
    }

    // TOTAL soma os PAGAMENTOS, a mesma régua do card "Faturamento" da tela —
    // somar itens divergia sempre que um prêmio de fidelidade zerava um
    // serviço, e relatório diferente do dashboard mina a confiança nos dois.
    const total = orders.reduce(
      (acc, o) => acc + o.payments.reduce((a, p) => a + Number(p.valor), 0),
      0,
    )
    rows.push([])
    rows.push(['', '', '', '', '', '', '', 'TOTAL', dinheiro(total), ''])

    const csv = buildCsv(
      ['Data', 'Hora', 'Cliente', 'Profissional', 'Tipo', 'Item', 'Qtd', 'Preço unit.', 'Subtotal', 'Pagamento'],
      rows,
    )

    downloadCsv(`financeiro-${intervalo.sufixo}.csv`, csv)
    onClose()
  }

  const opcoes: { valor: PeriodoDoRelatorio; rotulo: string }[] = [
    { valor: 'dia', rotulo: 'Hoje' },
    { valor: 'semana', rotulo: 'Esta semana' },
    { valor: 'mes', rotulo: rotuloDoMes },
  ]

  return (
    <Modal onClose={onClose} titulo="Exportar relatório" tamanho="sm">
      <div>
        <span className="text-xs font-medium text-muted-foreground">Período</span>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {opcoes.map((op) => (
            <button
              key={op.valor}
              onClick={() => setPeriodo(op.valor)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                periodo === op.valor
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border-strong text-foreground hover:bg-surface-2'
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Gera um arquivo CSV (abre no Excel) com uma linha por item vendido: data, cliente,
        profissional, serviço/produto/pacote, valores e forma de pagamento.
      </p>

      <ErroInline>{error}</ErroInline>

      <button
        onClick={handleExport}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Download size={16} />
        {busy ? 'Gerando...' : 'Baixar relatório'}
      </button>
    </Modal>
  )
}
