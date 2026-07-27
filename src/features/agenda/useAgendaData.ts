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
  /** service_id -> profissionais que executam esse serviço. */
  const [executantes, setExecutantes] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { start, end } = dayBounds(date)

    const [profResult, servResult, apptResult, vinculoResult] = await Promise.all([
      supabase.from('professionals').select('id, nome, ativo').eq('salon_id', salonId).eq('ativo', true).order('nome'),
      supabase.from('services').select('id, nome, duracao_minutos, preco').eq('salon_id', salonId).eq('ativo', true).order('nome'),
      supabase
        .from('appointments')
        .select('id, professional_id, client_id, service_id, data_hora_inicio, data_hora_fim, status, clients(nome), services(nome)')
        .eq('salon_id', salonId)
        .gte('data_hora_inicio', start)
        .lte('data_hora_inicio', end)
        .neq('status', 'cancelado')
        .order('data_hora_inicio'),
      // Quem executa cada serviço. Sem isso a agenda ofereceria qualquer
      // barbeiro para qualquer serviço.
      supabase
        .from('professional_services')
        .select('professional_id, service_id, professionals!inner(salon_id)')
        .eq('professionals.salon_id', salonId),
    ])

    if (profResult.error || servResult.error || apptResult.error || vinculoResult.error) {
      console.error(profResult.error || servResult.error || apptResult.error || vinculoResult.error)
      setError('Não foi possível carregar a agenda.')
      setLoading(false)
      return
    }

    setProfessionals(profResult.data ?? [])
    setServices(servResult.data ?? [])

    const porServico = new Map<string, string[]>()
    for (const v of (vinculoResult.data ?? []) as { professional_id: string; service_id: string }[]) {
      const lista = porServico.get(v.service_id) ?? []
      lista.push(v.professional_id)
      porServico.set(v.service_id, lista)
    }
    setExecutantes(porServico)
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

  /**
   * Quem pode atender um serviço.
   *
   * Serviço sem nenhum vínculo cadastrado devolve todo mundo: barbearia
   * antiga (ou serviço criado antes deste controle) não pode ficar sem
   * ninguém disponível para agendar.
   */
  const profissionaisDoServico = useCallback(
    (serviceId: string | null | undefined) => {
      if (!serviceId) return professionals
      const ids = executantes.get(serviceId)
      if (!ids || ids.length === 0) return professionals
      return professionals.filter((p) => ids.includes(p.id))
    },
    [professionals, executantes],
  )

  return { professionals, services, appointments, profissionaisDoServico, loading, error, reload }
}
