import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type AgentPeriod = 'semana' | 'mes'

export type ReativacaoResumo = {
  enviados: number
  confirmados: number
  remarcados: number
  cancelados: number
  receita_concluida: number
}

export type AgentStats = {
  conversas: number
  mensagensAgente: number
  tempoRespostaMedioSeg: number | null
  agendamentos: number
  cancelamentos: number
  pedidosDono: number
  // Sempre do mês corrente (a view agrega por mês), independente do período.
  reativacao: ReativacaoResumo | null
}

const EMPTY: AgentStats = {
  conversas: 0,
  mensagensAgente: 0,
  tempoRespostaMedioSeg: null,
  agendamentos: 0,
  cancelamentos: 0,
  pedidosDono: 0,
  reativacao: null,
}

function startOf(period: AgentPeriod): Date {
  const now = new Date()
  if (period === 'semana') {
    const d = new Date(now)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

type MessageRow = {
  conversation_id: string
  direction: 'in' | 'out'
  sender: 'cliente' | 'agente' | 'dono'
  created_at: string
}

export function useAgentStats(salonId: string | null, period: AgentPeriod) {
  const [stats, setStats] = useState<AgentStats>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const startISO = startOf(period).toISOString()

    // Conversas do salão (para saber quais mensagens considerar)
    const { data: convData, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id, needs_human')
      .eq('salon_id', salonId)

    if (convError) {
      console.error('Erro ao carregar conversas:', convError)
      setError('Não foi possível carregar as estatísticas do agente.')
      setLoading(false)
      return
    }

    const conversationIds = (convData ?? []).map((c) => c.id as string)
    if (conversationIds.length === 0) {
      setStats(EMPTY)
      setLoading(false)
      return
    }

    const [msgResult, apptResult, reatResult] = await Promise.all([
      supabase
        .from('whatsapp_messages')
        .select('conversation_id, direction, sender, created_at')
        .in('conversation_id', conversationIds)
        .gte('created_at', startISO)
        .order('created_at', { ascending: true }),
      supabase
        .from('appointments')
        .select('status, origem, created_at')
        .eq('salon_id', salonId)
        .eq('origem', 'agente')
        .gte('created_at', startISO),
      supabase
        .from('reativacao_resumo')
        .select('enviados, confirmados, remarcados, cancelados, receita_concluida')
        .eq('salon_id', salonId)
        .maybeSingle(),
    ])

    if (msgResult.error || apptResult.error) {
      console.error(msgResult.error || apptResult.error)
      setError('Não foi possível carregar as estatísticas do agente.')
      setLoading(false)
      return
    }

    const messages = (msgResult.data ?? []) as MessageRow[]
    const appointments = (apptResult.data ?? []) as { status: string }[]

    // Conversas que tiveram atividade do agente no período
    const conversasAtivas = new Set(
      messages.filter((m) => m.sender === 'agente').map((m) => m.conversation_id),
    )

    // Tempo de resposta: intervalo entre a mensagem do cliente e a resposta
    // do agente logo em seguida, na mesma conversa.
    const porConversa = new Map<string, MessageRow[]>()
    for (const m of messages) {
      const list = porConversa.get(m.conversation_id) ?? []
      list.push(m)
      porConversa.set(m.conversation_id, list)
    }

    const tempos: number[] = []
    for (const list of porConversa.values()) {
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].direction === 'in' && list[i + 1].sender === 'agente') {
          const diff =
            (new Date(list[i + 1].created_at).getTime() - new Date(list[i].created_at).getTime()) / 1000
          // Ignora intervalos absurdos (conversa retomada horas depois).
          if (diff >= 0 && diff < 600) tempos.push(diff)
        }
      }
    }

    setStats({
      conversas: conversasAtivas.size,
      mensagensAgente: messages.filter((m) => m.sender === 'agente').length,
      tempoRespostaMedioSeg: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
      agendamentos: appointments.filter((a) => a.status !== 'cancelado').length,
      cancelamentos: appointments.filter((a) => a.status === 'cancelado').length,
      pedidosDono: (convData ?? []).filter((c) => c.needs_human).length,
      reativacao: reatResult.error
        ? null
        : ((reatResult.data as ReativacaoResumo | null) ?? null),
    })
    setLoading(false)
  }, [salonId, period])

  useEffect(() => {
    reload()
  }, [reload])

  return { stats, loading, error, reload }
}
