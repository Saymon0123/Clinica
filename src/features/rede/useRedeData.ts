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
  cancelamentos: number
  /** Faturamento ÷ vendas: quanto o cliente gasta em média na unidade. */
  ticketMedio: number
}

/** Faturamento da rede por dia, para o gráfico de evolução. */
export type PontoDiario = { dia: string; total: number }

export type Periodo = 'mes' | 'semana'

function inicioDoPeriodo(periodo: Periodo) {
  const d = new Date()
  if (periodo === 'semana') {
    // Segunda-feira, como nas outras telas (Clientes, agente) — "esta semana"
    // precisa ser a mesma janela no sistema inteiro.
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
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
  const [serieDiaria, setSerieDiaria] = useState<PontoDiario[]>([])
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

    const [vendasRes, agendaRes, cancelRes, clientesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('salon_id, closed_at, payments(valor)')
        .in('salon_id', salonIds)
        .eq('status', 'fechada')
        .gte('closed_at', desde),
      supabase
        .from('appointments')
        .select('salon_id, status')
        .in('salon_id', salonIds)
        .gte('data_hora_inicio', desde)
        .neq('status', 'bloqueio'),
      // Cancelamentos pela data em que ACONTECEU o cancelamento (cancelado_em),
      // mesma regra do Financeiro desde 2026-08-24.
      supabase
        .from('appointments')
        .select('salon_id')
        .in('salon_id', salonIds)
        .gte('cancelado_em', desde),
      supabase.from('clients').select('salon_id').in('salon_id', salonIds).gte('created_at', desde),
    ])

    if (vendasRes.error || agendaRes.error || cancelRes.error || clientesRes.error) {
      console.error(vendasRes.error ?? agendaRes.error ?? cancelRes.error ?? clientesRes.error)
      setErro('Não foi possível carregar os números da rede.')
      setLoading(false)
      return
    }

    type LinhaVenda = {
      salon_id: string
      closed_at: string | null
      payments: { valor: number | string }[] | null
    }

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
          cancelamentos: 0,
          ticketMedio: 0,
        },
      ]),
    )

    const porDia = new Map<string, number>()

    for (const linha of (vendasRes.data ?? []) as LinhaVenda[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (!alvo) continue
      alvo.vendas += 1
      const valor = (linha.payments ?? []).reduce((s, p) => s + (Number(p.valor) || 0), 0)
      alvo.faturamento += valor
      if (linha.closed_at) {
        const dia = linha.closed_at.slice(0, 10)
        porDia.set(dia, (porDia.get(dia) ?? 0) + valor)
      }
    }
    for (const linha of (agendaRes.data ?? []) as { salon_id: string; status: string }[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (!alvo) continue
      if (linha.status !== 'cancelado') alvo.agendamentos += 1
    }
    for (const linha of (cancelRes.data ?? []) as { salon_id: string }[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (alvo) alvo.cancelamentos += 1
    }
    for (const linha of (clientesRes.data ?? []) as { salon_id: string }[]) {
      const alvo = porUnidade.get(linha.salon_id)
      if (alvo) alvo.clientesNovos += 1
    }

    const lista = [...porUnidade.values()].map((r) => ({
      ...r,
      ticketMedio: r.vendas > 0 ? r.faturamento / r.vendas : 0,
    }))

    setResumos(lista.sort((a, b) => b.faturamento - a.faturamento))
    setSerieDiaria(
      [...porDia.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, total]) => ({ dia: dia.slice(8) + '/' + dia.slice(5, 7), total })),
    )
    setLoading(false)
    // `ids` entra na lista para reagir quando as unidades mudam de fato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, periodo])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { resumos, serieDiaria, loading, erro, recarregar: carregar }
}
