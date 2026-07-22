import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'

export function useSalon() {
  const { user } = useAuth()
  const [salonId, setSalonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSalonId(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('profiles')
      .select('salon_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Erro ao carregar perfil do salão:', error)
        }
        setSalonId(data?.salon_id ?? null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  return { salonId, loading }
}
