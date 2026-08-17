import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Appointment, Professional, Service } from './types'

function dayBounds(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function useAgendaData(salonId: string | null, date: Date) {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { start, end } = dayBounds(date)

    const [profResult, servResult, apptResult] = await Promise.all([
      supabase.from('professionals').select('id, nome, ativo').eq('salon_id', salonId).eq('ativo', true).order('nome'),
      supabase.from('services').select('id, nome, duracao_minutos, preco').eq('salon_id', salonId).eq('ativo', true).order('nome'),
      supabase
        .from('appointments')
        .select(
          'id, professional_id, client_id, service_id, data_hora_inicio, data_hora_fim, status, chegou_em, iniciado_em, atraso_perguntado_em, clients(nome), services(nome)',
        )
        .eq('salon_id', salonId)
        .gte('data_hora_inicio', start)
        .lte('data_hora_inicio', end)
        .neq('status', 'cancelado')
        .order('data_hora_inicio'),
    ])

    if (profResult.error || servResult.error || apptResult.error) {
      console.error(profResult.error || servResult.error || apptResult.error)
      setError('Não foi possível carregar a agenda.')
      setLoading(false)
      return
    }

    setProfessionals(profResult.data ?? [])
    setServices(servResult.data ?? [])
    setAppointments(
      (apptResult.data ?? []).map((row) => {
        const r = row as unknown as Appointment & { clients: { nome: string } | null; services: { nome: string } | null }
        return {
          id: r.id,
          professional_id: r.professional_id,
          client_id: r.client_id,
          service_id: r.service_id,
          data_hora_inicio: r.data_hora_inicio,
          data_hora_fim: r.data_hora_fim,
          status: r.status,
          chegou_em: r.chegou_em ?? null,
          iniciado_em: r.iniciado_em ?? null,
          atraso_perguntado_em: r.atraso_perguntado_em ?? null,
          client_nome: r.clients?.nome ?? null,
          service_nome: r.services?.nome ?? null,
        }
      }),
    )
    setLoading(false)
  }, [salonId, date])

  useEffect(() => {
    reload()
  }, [reload])

  return { professionals, services, appointments, loading, error, reload }
}
