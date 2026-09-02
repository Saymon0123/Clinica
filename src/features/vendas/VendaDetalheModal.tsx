import { useCallback, useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Badge } from '../../components/Badge'
import { ErroInline } from '../../components/ErroInline'
import { SkeletonLinhas } from '../../components/Skeleton'
import { toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { PAYMENT_LABELS } from './types'

/**
 * O detalhe da comanda (achado 8 da revisão de 01/09).
 *
 * Depois de gravada, a venda não tinha detalhe nenhum: a lista mostrava data,
 * cliente e total, e acabou. Digitou o produto errado, o cliente desistiu,
 * cobrou duas vezes — o número ficava no faturamento para sempre, e o estoque
 * e a comissão junto com ele.
 *
 * Aqui a comanda se abre por inteiro e ganha a única ação que faltava:
 * estornar. Quem desfaz é a RPC `estornar_venda` (0127) — devolver estoque,
 * apagar consumo de pacote, apagar o pacote comprado e desfazer a comissão são
 * cinco escritas que precisam cair juntas ou não cair, então nada disso é
 * feito daqui em cima.
 */

const TIPO_LABELS: Record<string, string> = {
  servico: 'Serviço',
  produto: 'Produto',
  pacote: 'Pacote',
}

type ItemRow = {
  id: string
  tipo: string
  quantidade: number
  preco_unitario: number
  services: { nome: string } | { nome: string }[] | null
  products: { nome: string } | { nome: string }[] | null
}

type OrderRow = {
  id: string
  created_at: string
  closed_at: string | null
  status: 'aberta' | 'fechada' | 'cancelada'
  clients: { nome: string } | { nome: string }[] | null
  professionals: { nome: string } | { nome: string }[] | null
  payments: { forma_pagamento: string; valor: number }[]
  order_items: ItemRow[]
}

type Item = {
  id: string
  tipo: string
  nome: string
  quantidade: number
  preco_unitario: number
}

type Venda = {
  status: 'aberta' | 'fechada' | 'cancelada'
  quando: string
  cliente: string
  profissional: string
  pagamentos: string[]
  itens: Item[]
  total: number
}

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VendaDetalheModal({
  saleId,
  onClose,
  onEstornada,
}: {
  saleId: string
  onClose: () => void
  /** A venda saiu do faturamento: a lista de quem chamou precisa recarregar. */
  onEstornada: () => void
}) {
  // Estornar é do gestor: a RPC recusa quem não for (42501), mas mostrar um
  // botão que o servidor vai negar é exatamente o padrão que a revisão
  // apontou como caminho enganoso.
  const { isManager } = useSalon()

  const [venda, setVenda] = useState<Venda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmEstorno, setConfirmEstorno] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, created_at, closed_at, status, clients(nome), professionals(nome), payments(forma_pagamento, valor), order_items(id, tipo, quantidade, preco_unitario, services(nome), products(nome))',
      )
      .eq('id', saleId)
      .single()

    if (fetchError || !data) {
      console.error('Erro ao carregar a venda:', fetchError)
      setError('Não foi possível carregar esta venda.')
      setLoading(false)
      return
    }

    const row = data as unknown as OrderRow

    // Item de pacote não guarda a referência do modelo em `order_items` (só
    // serviço e produto têm coluna própria). O nome vem do crédito que a venda
    // criou, em `pacotes_do_cliente`. Se a venda já foi estornada esse crédito
    // não existe mais — e aí o rótulo genérico é a verdade disponível.
    const temPacote = row.order_items.some((i) => i.tipo === 'pacote')
    let nomesDePacote: string[] = []
    if (temPacote) {
      const { data: pacotes } = await supabase
        .from('pacotes_do_cliente')
        .select('id, comprado_em, pacotes(nome)')
        .eq('order_id', saleId)
        .order('comprado_em')
      nomesDePacote = ((pacotes ?? []) as unknown as { pacotes: { nome: string } | { nome: string }[] | null }[])
        .map((p) => one(p.pacotes)?.nome ?? '')
        .filter(Boolean)
    }

    let usadosDePacote = 0
    const itens: Item[] = row.order_items.map((i) => {
      let nome = one(i.services)?.nome ?? one(i.products)?.nome ?? null
      if (!nome && i.tipo === 'pacote') nome = nomesDePacote[usadosDePacote++] ?? 'Pacote'
      return {
        id: i.id,
        tipo: i.tipo,
        nome: nome ?? '—',
        quantidade: i.quantidade,
        preco_unitario: Number(i.preco_unitario),
      }
    })

    setVenda({
      status: row.status,
      quando: row.closed_at ?? row.created_at,
      cliente: one(row.clients)?.nome ?? '—',
      profissional: one(row.professionals)?.nome ?? '—',
      pagamentos: row.payments.map((p) => PAYMENT_LABELS[p.forma_pagamento] ?? p.forma_pagamento),
      itens,
      total: itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0),
    })
    setLoading(false)
  }, [saleId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function estornar() {
    setBusy(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('estornar_venda', { p_order_id: saleId })

    if (rpcError) {
      console.error('Erro ao estornar venda:', rpcError)
      // A 0127 já levanta as três recusas em português (já estornada, comissão
      // paga, sem permissão); o tradutor dá preferência a elas.
      setError(traduzirErroDoBanco(rpcError, undefined, 'Não foi possível estornar a venda. Tente novamente.'))
      setBusy(false)
      setConfirmEstorno(false)
      return
    }

    toast('Venda estornada')
    setBusy(false)
    onEstornada()
    onClose()
  }

  return (
    <Modal onClose={onClose} titulo="Detalhe da venda" tamanho="md">
      {loading ? (
        <SkeletonLinhas linhas={5} />
      ) : !venda ? (
        <ErroInline>{error}</ErroInline>
      ) : (
        <div className="space-y-4">
          {venda.status === 'cancelada' && (
            <div>
              <Badge variante="perigo">Estornada</Badge>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Quando</dt>
              <dd className="text-foreground">{formatDateTime(venda.quando)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cliente</dt>
              <dd className="text-foreground">{venda.cliente}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Profissional</dt>
              <dd className="text-foreground">{venda.profissional}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Pagamento</dt>
              <dd className="text-foreground">
                {venda.pagamentos.length > 0 ? venda.pagamentos.join(' + ') : '—'}
              </dd>
            </div>
          </dl>

          <div className="border border-border rounded-xl divide-y divide-border/60">
            {venda.itens.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Esta comanda não tem itens.</p>
            ) : (
              venda.itens.map((i) => (
                <div key={i.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{i.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_LABELS[i.tipo] ?? i.tipo} · {i.quantidade} ×{' '}
                      {formatCurrency(i.preco_unitario)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground shrink-0">
                    {formatCurrency(i.quantidade * i.preco_unitario)}
                  </span>
                </div>
              ))
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-sm font-semibold text-foreground">
                {formatCurrency(venda.total)}
              </span>
            </div>
          </div>

          <ErroInline>{error}</ErroInline>

          {venda.status === 'fechada' && isManager &&
            (confirmEstorno ? (
              /* Confirmação inline, como no cancelar da agenda: estorno mexe em
                 caixa, estoque, pacote e comissão de uma vez, então a frase
                 lista tudo antes do toque. */
              <div className="border border-border-strong rounded-lg px-3 py-3 space-y-3">
                <p className="text-xs text-danger">
                  Estornar esta venda? O valor sai do faturamento do dia, os produtos voltam ao
                  estoque, os créditos de pacote voltam para o cliente e a comissão é desfeita.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setConfirmEstorno(false)}
                    disabled={busy}
                    className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={estornar}
                    disabled={busy}
                    className="btn-danger rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    {busy ? 'Estornando...' : 'Sim, estornar'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEstorno(true)}
                disabled={busy}
                className="w-full flex items-center justify-center gap-1.5 btn-danger rounded-lg px-3 py-2 text-sm font-medium"
              >
                <RotateCcw size={16} />
                Estornar venda
              </button>
            ))}
        </div>
      )}
    </Modal>
  )
}
