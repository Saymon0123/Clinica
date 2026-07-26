import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'

export type Papel = 'owner' | 'gerente' | 'barbeiro'

/**
 * Salão e papel do usuário logado.
 *
 * A fonte da verdade é `user_salons` — a mesma tabela que as políticas do
 * banco usam. Ler de outro lugar (como a antiga `profiles`) abriria espaço
 * para a tela mostrar um papel diferente do que o banco realmente aplica.
 *
 * Um dono de rede tem várias linhas; por enquanto assumimos a primeira como
 * unidade atual (o seletor de unidade entra na etapa de rede).
 */
export function useSalon() {
  const { user } = useAuth()
  const [salonId, setSalonId] = useState<string | null>(null)
  const [salonName, setSalonName] = useState<string | null>(null)
  const [role, setRole] = useState<Papel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSalonId(null)
      setSalonName(null)
      setRole(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('user_salons')
      .select('salon_id, role, salons ( nome )')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Erro ao carregar o salão do usuário:', error)
        }

        const vinculo = data?.[0]
        setSalonId(vinculo?.salon_id ?? null)
        setRole((vinculo?.role as Papel) ?? null)

        const relacao = vinculo?.salons as { nome?: string } | { nome?: string }[] | null | undefined
        const nome = Array.isArray(relacao) ? relacao[0]?.nome : relacao?.nome
        setSalonName(nome ?? null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const isManager = role === 'owner' || role === 'gerente'

  return { salonId, salonName, role, isManager, loading }
}
