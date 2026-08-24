import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Client } from './types'

export function useClientsData(salonId: string | null) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    // A view acrescenta a última visita (agendamento concluído mais recente);
    // a RLS por trás dela continua decidindo o que cada papel enxerga.
    const { data, error: fetchError } = await supabase
      .from('clientes_com_ultima_visita')
      .select('id, nome, telefone, aniversario, observacao, created_at, ultima_visita')
      .eq('salon_id', salonId)
      .order('nome')

    if (fetchError) {
      console.error('Erro ao carregar clientes:', fetchError)
      setError('Não foi possível carregar os clientes.')
      setLoading(false)
      return
    }

    setClients((data ?? []) as Client[])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  // O agente do WhatsApp cadastra clientes sozinho; sem isso, o cliente novo
  // só aparecia depois de sair e voltar na aba. Debounce de 2s para uma
  // importação de CSV não disparar um reload por linha.
  useEffect(() => {
    if (!salonId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const agendar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => reload(), 2000)
    }
    const channel = supabase
      .channel(`clientes_${salonId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients', filter: `salon_id=eq.${salonId}` },
        agendar,
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [salonId, reload])

  return { clients, loading, error, reload }
}
