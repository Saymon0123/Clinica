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

    const { data, error: fetchError } = await supabase
      .from('clients')
      .select('id, nome, telefone, aniversario, observacao, created_at')
      .eq('salon_id', salonId)
      .order('nome')

    if (fetchError) {
      console.error('Erro ao carregar clientes:', fetchError)
      setError('Não foi possível carregar os clientes.')
      setLoading(false)
      return
    }

    setClients(data ?? [])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { clients, loading, error, reload }
}
