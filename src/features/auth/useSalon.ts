import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'

export function useSalon() {
  const { user } = useAuth()
  const [salonId, setSalonId] = useState<string | null>(null)
  const [salonName, setSalonName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSalonId(null)
      setSalonName(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('profiles')
      .select('salon_id, salons ( nome )')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Erro ao carregar perfil do salão:', error)
        }
        setSalonId(data?.salon_id ?? null)
        const salonRelation = data?.salons as { nome?: string } | { nome?: string }[] | null | undefined
        const nome = Array.isArray(salonRelation) ? salonRelation[0]?.nome : salonRelation?.nome
        setSalonName(nome ?? null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  return { salonId, salonName, loading }
}
