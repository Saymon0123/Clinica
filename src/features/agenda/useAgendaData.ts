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

/** Janela de trabalho do profissional no dia exibido, em minutos desde 00:00. */
export type Jornada = { inicioMin: number; fimMin: number }

function minutosDe(hora: string) {
  const [h, m] = String(hora).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function useAgendaData(salonId: string | null, date: Date) {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  // null = folga naquele dia; ausente do mapa = jornada nunca configurada
  // (aí a grade fica neutra, sem sombrear nada — sombrear tudo assustaria
  // exatamente quem acabou de criar a conta).
  const [jornadas, setJornadas] = useState<Record<string, Jornada | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { start, end } = dayBounds(date)

    const [profResult, servResult, apptResult, jornadaResult] = await Promise.all([
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
        // Cancelado FICA na grade, cinza e riscado — decisão de 2026-08-24: o
        // barbeiro precisa ver que o horário caiu (e por quê aquele buraco
        // existe), e é do bloco cancelado que sai o botão de excluir de vez.
        // As travas de sobreposição e o horarios_livres já ignoram cancelados,
        // então o horário continua livre de verdade para remarcar por cima.
        .order('data_hora_inicio'),
      // Jornada do dia exibido, só para SOMBREAR a grade (fora da jornada =
      // cinza). Não trava clique nenhum: encaixe fora do expediente continua
      // possível, como sempre foi — quem valida é o fluxo de criação.
      supabase
        .from('professional_schedules')
        .select('professional_id, hora_inicio, hora_fim, ativo')
        .eq('dia_semana', date.getDay()),
    ])

    if (profResult.error || servResult.error || apptResult.error) {
      console.error(profResult.error || servResult.error || apptResult.error)
      setError('Não foi possível carregar a agenda.')
      setLoading(false)
      return
    }

    // Falha aqui não derruba a agenda: sem jornada, a grade só fica sem sombra.
    const mapaJornadas: Record<string, Jornada | null> = {}
    for (const j of jornadaResult.data ?? []) {
      mapaJornadas[j.professional_id] = j.ativo
        ? { inicioMin: minutosDe(j.hora_inicio), fimMin: minutosDe(j.hora_fim) }
        : null
    }
    setJornadas(mapaJornadas)

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

  return { professionals, services, appointments, jornadas, loading, error, reload }
}
