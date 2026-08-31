import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playAppointmentSound } from '../../lib/sound'

export type AppointmentAlertData = {
  id: string
  clientName: string
  serviceName: string
  startsAt: string
}

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

  const fetchDetails = useCallback(async (appointmentId: string) => {
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
    playAppointmentSound()
  }, [])

  useEffect(() => {
    if (!salonId) return

    const channel = supabase
      .channel(`appointments_new_${salonId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        (payload) => {
          const newId = (payload.new as { id: string }).id
          fetchDetails(newId)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [salonId, fetchDetails])

  function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  return { alerts, dismiss }
}
