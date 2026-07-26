import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Unidade } from '../auth/useSalon'

export type ProducaoBarbeiro = {
  professionalId: string
  nome: string
  unidade: string
  faturamento: number
  atendimentos: number
  ticketMedio: number
  comissao: number
}

/**
 * Produção por barbeiro somando todas as unidades da rede.
 *
 * O faturamento vem dos itens de comanda (e não do pagamento da comanda
 * inteira), porque uma comanda pode ter itens de profissionais diferentes —
 * ratear pelo pagamento atribuiria venda de um ao outro.
 */
export function useProducaoBarbeiros(unidades: Unidade[], desdeISO: string) {
  const [producao, setProducao] = useState<ProducaoBarbeiro[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const ids = unidades.map((u) => u.salonId).join(',')

  const carregar = useCallback(async () => {
    if (unidades.length === 0) {
      setProducao([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErro(null)
    const salonIds = unidades.map((u) => u.salonId)
    const nomeDaUnidade = new Map(unidades.map((u) => [u.salonId, u.nome]))

    const [profRes, itensRes] = await Promise.all([
      supabase.from('professionals').select('id, nome, salon_id').in('salon_id', salonIds),
      supabase
        .from('order_items')
        .select(
          'professional_id, quantidade, preco_unitario, commissions(valor_calculado), orders!inner(salon_id, status, closed_at)',
        )
        .in('orders.salon_id', salonIds)
        .eq('orders.status', 'fechada')
        .gte('orders.closed_at', desdeISO),
    ])

    if (profRes.error || itensRes.error) {
      console.error(profRes.error ?? itensRes.error)
      setErro('Não foi possível carregar a produção por barbeiro.')
      setLoading(false)
      return
    }

    type LinhaProf = { id: string; nome: string; salon_id: string }
    type LinhaItem = {
      professional_id: string | null
      quantidade: number | null
      preco_unitario: number | string
      commissions: { valor_calculado: number | string }[] | null
    }

    const acc = new Map<string, ProducaoBarbeiro>(
      ((profRes.data ?? []) as LinhaProf[]).map((p) => [
        p.id,
        {
          professionalId: p.id,
          nome: p.nome,
          unidade: nomeDaUnidade.get(p.salon_id) ?? '—',
          faturamento: 0,
          atendimentos: 0,
          ticketMedio: 0,
          comissao: 0,
        },
      ]),
    )

    for (const item of (itensRes.data ?? []) as unknown as LinhaItem[]) {
      if (!item.professional_id) continue
      const alvo = acc.get(item.professional_id)
      if (!alvo) continue
      alvo.faturamento += (Number(item.preco_unitario) || 0) * (item.quantidade ?? 1)
      alvo.atendimentos += 1
      for (const c of item.commissions ?? []) alvo.comissao += Number(c.valor_calculado) || 0
    }

    setProducao(
      [...acc.values()]
        .map((p) => ({ ...p, ticketMedio: p.atendimentos > 0 ? p.faturamento / p.atendimentos : 0 }))
        .sort((a, b) => b.faturamento - a.faturamento),
    )
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, desdeISO])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { producao, loading, erro }
}
