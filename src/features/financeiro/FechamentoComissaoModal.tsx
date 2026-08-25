import { useCallback, useEffect, useState } from 'react'
import { Check, HandCoins, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'

type LinhaComissao = {
  id: string
  valor_calculado: number | string
  pago: boolean
  professional_id: string
  professionals: { nome?: string } | { nome?: string }[] | null
  order_items: { orders: { closed_at: string | null } | { closed_at: string | null }[] | null } | null
}

type PorProfissional = {
  professionalId: string
  nome: string
  pendenteIds: string[]
  pendenteValor: number
  pagoValor: number
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function primeiro<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined)
}

/**
 * Fechamento de comissão: lê a tabela `commissions` (o valor gravado na hora
 * da venda) em vez de recalcular a partir dos itens. Recalcular daria número
 * diferente se o percentual do profissional mudasse depois da venda.
 */
export function FechamentoComissaoModal({
  salonId,
  onClose,
}: {
  salonId: string
  onClose: () => void
}) {
  const [linhas, setLinhas] = useState<PorProfissional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)

    const inicio = new Date(`${mes}-01T00:00:00`)
    const fim = new Date(inicio)
    fim.setMonth(fim.getMonth() + 1)

    const { data, error } = await supabase
      .from('commissions')
      .select(
        'id, valor_calculado, pago, professional_id, professionals!inner(nome, salon_id), order_items!inner(orders!inner(closed_at))',
      )
      .eq('professionals.salon_id', salonId)

    if (error) {
      console.error('Erro ao carregar comissões:', error)
      setErro('Não foi possível carregar as comissões.')
      setCarregando(false)
      return
    }

    const porProf = new Map<string, PorProfissional>()
    for (const linha of (data ?? []) as unknown as LinhaComissao[]) {
      const pedido = primeiro(linha.order_items?.orders)
      const fechado = pedido?.closed_at ? new Date(pedido.closed_at) : null
      if (!fechado || fechado < inicio || fechado >= fim) continue

      const nome = primeiro(linha.professionals)?.nome ?? 'Profissional'
      const atual =
        porProf.get(linha.professional_id) ??
        {
          professionalId: linha.professional_id,
          nome,
          pendenteIds: [],
          pendenteValor: 0,
          pagoValor: 0,
        }

      const valor = Number(linha.valor_calculado) || 0
      if (linha.pago) {
        atual.pagoValor += valor
      } else {
        atual.pendenteValor += valor
        atual.pendenteIds.push(linha.id)
      }
      porProf.set(linha.professional_id, atual)
    }

    setLinhas([...porProf.values()].sort((a, b) => b.pendenteValor - a.pendenteValor))
    setCarregando(false)
  }, [salonId, mes])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcarPago(linha: PorProfissional) {
    if (linha.pendenteIds.length === 0) return
    setPagando(linha.professionalId)
    setErro(null)

    const { error } = await supabase
      .from('commissions')
      .update({ pago: true, pago_em: new Date().toISOString() })
      .in('id', linha.pendenteIds)

    setPagando(null)
    if (error) {
      console.error('Erro ao marcar comissão como paga:', error)
      setErro('Não foi possível registrar o pagamento.')
      return
    }
    toast('Comissão marcada como paga')
    carregar()
  }

  const totalPendente = linhas.reduce((s, l) => s + l.pendenteValor, 0)
  const totalPago = linhas.reduce((s, l) => s + l.pagoValor, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <HandCoins size={18} />
            Fechamento de comissão
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Mês de referência</span>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-lg px-3 py-2">
            <div className="text-xs text-muted-foreground">A pagar</div>
            <div className="text-lg font-semibold text-foreground">{moeda(totalPendente)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg px-3 py-2">
            <div className="text-xs text-muted-foreground">Já pago</div>
            <div className="text-lg font-semibold text-success">{moeda(totalPago)}</div>
          </div>
        </div>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma comissão registrada neste mês.
          </p>
        ) : (
          <div className="space-y-2">
            {linhas.map((l) => (
              <div key={l.professionalId} className="flex items-center justify-between gap-3 bg-surface-2 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{l.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.pendenteValor > 0
                      ? `${moeda(l.pendenteValor)} a pagar`
                      : 'Tudo pago neste mês'}
                    {l.pagoValor > 0 && ` · ${moeda(l.pagoValor)} já pago`}
                  </div>
                </div>
                {l.pendenteValor > 0 ? (
                  <button
                    onClick={() => marcarPago(l)}
                    disabled={pagando === l.professionalId}
                    className="shrink-0 btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {pagando === l.professionalId ? 'Salvando...' : 'Marcar como pago'}
                  </button>
                ) : (
                  <Check size={16} className="text-success shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Os valores vêm do que foi gravado na venda, então mudar o percentual do barbeiro depois não
          altera comissões antigas.
        </p>
      </div>
    </div>
  )
}
