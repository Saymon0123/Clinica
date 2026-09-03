import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playAppointmentSound } from '../../lib/sound'
import { deveAvisar, type LinhaInserida } from './alertaDeReserva'

export type AppointmentAlertData = {
  id: string
  clientName: string
  serviceName: string
  startsAt: string
}

/**
 * Quanto tempo o aviso fica na tela sem ninguém tocar (achado 35 da revisão
 * de 01/09). Antes não tinha tempo de vida: cada reserva do agente virava um
 * cartão permanente, e uma manhã movimentada empilhava seis deles sobre o
 * cabeçalho do celular. Quinze segundos dão para ler; quem quiser o detalhe
 * abre a Agenda, que é onde a reserva está.
 */
export const TEMPO_DE_VIDA_MS = 15_000

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function useAppointmentAlerts(salonId: string | null) {
  const [alerts, setAlerts] = useState<AppointmentAlertData[]>([])
  // Um cronômetro por aviso: fechar à mão cancela o dele, desmontar cancela todos.
  const timersRef = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const fetchDetails = useCallback(
    async (appointmentId: string) => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, data_hora_inicio, clients(nome), services!appointments_service_id_fkey(nome)')
        .eq('id', appointmentId)
        .maybeSingle()

      if (error || !data) return

      const row = data as unknown as {
        id: string
        data_hora_inicio: string
        clients: { nome: string } | null
        services: { nome: string } | null
      }

      setAlerts((prev) => [
        {
          id: row.id,
          clientName: row.clients?.nome ?? 'Cliente',
          serviceName: row.services?.nome ?? 'Serviço',
          startsAt: formatDateTime(row.data_hora_inicio),
        },
        ...prev,
      ])
      timersRef.current.set(
        row.id,
        window.setTimeout(() => dismiss(row.id), TEMPO_DE_VIDA_MS),
      )
      playAppointmentSound()
    },
    [dismiss],
  )

  useEffect(() => {
    if (!salonId) return

    const channel = supabase
      .channel(`appointments_new_${salonId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        (payload) => {
          // O payload traz a linha inteira: dá para decidir sem ir ao banco.
          const linha = payload.new as LinhaInserida
          if (!deveAvisar(linha)) return
          fetchDetails(linha.id)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [salonId, fetchDetails])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  return { alerts, dismiss }
}
