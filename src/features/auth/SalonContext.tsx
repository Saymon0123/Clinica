import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'

export type Papel = 'owner' | 'gerente' | 'barbeiro'

export type Unidade = {
  salonId: string
  nome: string
  role: Papel
  organizationId: string | null
  ativo: boolean
}

export type SalonContextValue = {
  salonId: string | null
  salonName: string | null
  role: Papel | null
  /** Dono ou gerente: enxerga e edita tudo da unidade. */
  isManager: boolean
  /** Dono da rede: além da unidade, tem o painel analítico consolidado. */
  isOwner: boolean
  loading: boolean
  /** Todas as unidades em que o usuário tem vínculo, na ordem de criação. */
  unidades: Unidade[]
  /** true quando o usuário gerencia mais de uma unidade da mesma rede. */
  isNetwork: boolean
  organizationId: string | null
  selecionarUnidade: (salonId: string) => void
  recarregarUnidades: () => Promise<void>
}

export const SalonContext = createContext<SalonContextValue | null>(null)

/** Guarda a unidade escolhida por usuário, para não resetar a cada refresh. */
function chaveUnidade(userId: string) {
  return `salaocrm:unidade:${userId}`
}

type LinhaVinculo = {
  salon_id: string
  role: string
  salons:
    | { nome?: string; organization_id?: string | null; ativo?: boolean }
    | { nome?: string; organization_id?: string | null; ativo?: boolean }[]
    | null
}

export function SalonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!user) {
      setUnidades([])
      setSelecionada(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('user_salons')
      .select('salon_id, role, salons ( nome, organization_id, ativo )')
      .eq('user_id', user.id)
      .order('created_at')

    if (error) {
      console.error('Erro ao carregar as unidades do usuário:', error)
      setUnidades([])
      setSelecionada(null)
      setLoading(false)
      return
    }

    const lista: Unidade[] = ((data ?? []) as LinhaVinculo[]).map((linha) => {
      const relacao = Array.isArray(linha.salons) ? linha.salons[0] : linha.salons
      return {
        salonId: linha.salon_id,
        nome: relacao?.nome ?? 'Unidade sem nome',
        role: linha.role as Papel,
        organizationId: relacao?.organization_id ?? null,
        ativo: relacao?.ativo ?? true,
      }
    })

    setUnidades(lista)

    // Mantém a escolha anterior se ela ainda existir; senão cai na primeira.
    const guardada = localStorage.getItem(chaveUnidade(user.id))
    const valida = lista.some((u) => u.salonId === guardada)
    setSelecionada(valida ? guardada : (lista[0]?.salonId ?? null))
    setLoading(false)
  }, [user])

  useEffect(() => {
    carregar()
  }, [carregar])

  const selecionarUnidade = useCallback(
    (salonId: string) => {
      if (!user) return
      localStorage.setItem(chaveUnidade(user.id), salonId)
      setSelecionada(salonId)
    },
    [user],
  )

  const value = useMemo<SalonContextValue>(() => {
    const atual = unidades.find((u) => u.salonId === selecionada) ?? null
    const role = atual?.role ?? null
    const gerenciadas = unidades.filter((u) => u.role === 'owner' || u.role === 'gerente')
    // Dono em qualquer unidade já tem direito ao painel da rede — não depende
    // de qual unidade está selecionada no momento.
    const donoEmAlguma = unidades.some((u) => u.role === 'owner')

    return {
      salonId: atual?.salonId ?? null,
      salonName: atual?.nome ?? null,
      role,
      isManager: role === 'owner' || role === 'gerente',
      isOwner: donoEmAlguma,
      loading,
      unidades,
      isNetwork: gerenciadas.length > 1,
      organizationId: atual?.organizationId ?? null,
      selecionarUnidade,
      recarregarUnidades: carregar,
    }
  }, [unidades, selecionada, loading, selecionarUnidade, carregar])

  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>
}
