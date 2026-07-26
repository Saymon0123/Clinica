import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Unidade } from '../auth/useSalon'

export type ResumoUnidade = {
  salonId: string
  nome: string
  ativo: boolean
  faturamento: number
  vendas: number
  agendamentos: number
  clientesNovos: number
}

export type Periodo = 'mes' | 'semana'

function inicioDoPeriodo(periodo: Periodo) {
  const d = new Date()
  if (periodo === 'semana') {
    // Semana começando no domingo.
    d.setDate(d.getDate() - d.getDay())
  } else {
    d.setDate(1)
  }
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Números por unidade da rede. Cada consulta é filtrada por salon_id e o RLS
 * ainda se aplica — só volta o que o usuário realmente pode ver.
 */
export function useRedeData(unidades: Unidade[], periodo: Periodo) {
  const [resumos, setResumos] = useState<ResumoUnidade[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const ids = unidades.map((u) => u.salonId).join(',')

  const carregar = useCallback(async () => {
    if (unidades.length === 0) {
      setResumos([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErro(null)
    const desde = inicioDoPeriodo(periodo)
    const salonIds = unidades.map((u) => u.salonId)

    const [vendasRes, agendaRes, clientesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('salon_id, payments(valor)')
        .in('salon_id', salonIds)
        .eq('status', 'fechada')
        .gte('closed_at', desde),
      supabase
        .from('appointments')
        .select('salon_id')
        .in('salon_id', salonIds)
        .neq('status', 'cancelado')
        .gte('data_hora_inicio', desde),
      supabase.from('clients').select('salon_id').in('salon_id', salonIds).gte('created_at', desde),
    ])

    if (vendasRes.error || agendaRes.error || clientesRes.error) {
      console.error(vendasRes.error ?? agendaRes.error ?? clientesRes.error)
      setErro('Não foi possível carregar os números da rede.')
      setLoading(false)
      return
    }

    type LinhaVenda = { salon_id: string; payments: { valor: number | string }[] | null }

    const porUnidade = new Map<string, ResumoUnidade>(
      unidades.map((u) => [
        u.salonId,
        {
          salonId: u.salonId,
          nome: u.nome,
          ativo: u.ativo,
          faturamento: 0,
          vendas: 0,
          agendamentos: 0,
          clientesNovos: 0,
        },
      ]),
    )

    for (const linha of (vendasRes.data ?? []) as LinhaVenda[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (!alvo) continue
      alvo.vendas += 1
      for (const p of linha.payments ?? []) alvo.faturamento += Number(p.valor) || 0
    }
    for (const linha of (agendaRes.data ?? []) as { salon_id: string }[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (alvo) alvo.agendamentos += 1
    }
    for (const linha of (clientesRes.data ?? []) as { salon_id: string }[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (alvo) alvo.clientesNovos += 1
    }

    setResumos([...porUnidade.values()].sort((a, b) => b.faturamento - a.faturamento))
    setLoading(false)
    // `ids` entra na lista para reagir quando as unidades mudam de fato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, periodo])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { resumos, loading, erro, recarregar: carregar }
}
