import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { sessaoExpirou } from '../../lib/authErrors'
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
  /** true quando o usuário é DONO de mais de uma unidade. */
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
  const { user, loading: autenticando, signOut } = useAuth()
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    // Enquanto o AuthContext restaura a sessão do storage, `user` é nulo — mas
    // isso não significa "não logado", significa "ainda não sei". Declarar
    // `loading = false` aqui fazia o `RequireManager` concluir que o usuário não
    // é gestor e redirecionar para "/" antes de a sessão chegar.
    //
    // O sintoma era enganoso: navegando pelo menu tudo funcionava, porque a
    // autenticação já estava resolvida. Só quebrava em carregamento do zero —
    // URL digitada, refresh, ou o botão WEB, que abre `/web` em **nova aba** de
    // propósito. Todas as rotas de gestor ficavam inalcançáveis assim.
    if (autenticando) return

    if (!user) {
      setUnidades([])
      setSelecionada(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const buscarVinculos = () =>
      supabase
        .from('user_salons')
        .select('salon_id, role, salons ( nome, organization_id, ativo )')
        .eq('user_id', user.id)
        .order('created_at')

    let { data, error } = await buscarVinculos()

    // Aba parada por horas (ou em segundo plano, onde o timer de renovação do
    // supabase-js não roda) volta com o JWT vencido. Sem tratar isso, o erro
    // caía no mesmo caminho de "nenhuma unidade" e a tela dizia ao dono que a
    // conta dele não estava vinculada a salão nenhum — parecendo perda de dados.
    if (sessaoExpirou(error)) {
      const { error: erroRenovacao } = await supabase.auth.refreshSession()
      if (erroRenovacao) {
        // Refresh token também venceu: só o login resolve. Deslogar leva à tela
        // certa, em vez de deixar o usuário numa tela que mente sobre a causa.
        console.warn('Sessão expirada e não foi possível renovar. Encerrando.', erroRenovacao)
        await signOut()
        return
      }
      ;({ data, error } = await buscarVinculos())
    }

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

    // Mantém a escolha anterior se ela ainda existir.
    const guardada = localStorage.getItem(chaveUnidade(user.id))
    if (lista.some((u) => u.salonId === guardada)) {
      setSelecionada(guardada)
    } else {
      // Dono de rede começa sem unidade: ele entra pelo painel da rede e
      // escolhe a barbearia. Quem tem uma só cai direto nela.
      const proprias = lista.filter((u) => u.role === 'owner')
      setSelecionada(proprias.length > 1 ? null : (lista[0]?.salonId ?? null))
    }
    setLoading(false)
  }, [user, autenticando, signOut])

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
    // A rede é do dono. Gerente administra a unidade dele e não enxerga o
    // comparativo entre as barbearias, mesmo que gerencie mais de uma.
    const proprias = unidades.filter((u) => u.role === 'owner')
    const donoEmAlguma = proprias.length > 0

    return {
      salonId: atual?.salonId ?? null,
      salonName: atual?.nome ?? null,
      role,
      isManager: role === 'owner' || role === 'gerente',
      isOwner: donoEmAlguma,
      loading,
      unidades,
      isNetwork: proprias.length > 1,
      organizationId: atual?.organizationId ?? null,
      selecionarUnidade,
      recarregarUnidades: carregar,
    }
  }, [unidades, selecionada, loading, selecionarUnidade, carregar])

  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>
}
