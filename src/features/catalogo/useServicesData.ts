import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ServiceItem } from './types'

export function useServicesData(salonId: string | null) {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('services')
      .select('id, nome, duracao_minutos, preco, ativo')
      .eq('salon_id', salonId)
      .order('nome')

    if (fetchError) {
      console.error('Erro ao carregar serviços:', fetchError)
      setError('Não foi possível carregar os serviços.')
      setLoading(false)
      return
    }

    setServices(data ?? [])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { services, loading, error, reload }
}
