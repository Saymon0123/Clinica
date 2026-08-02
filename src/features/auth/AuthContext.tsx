import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { hashDeEntrada, hashIndicaRecuperacao } from '../../lib/recuperacaoSenha'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  /** true entre clicar no link do e-mail e salvar a nova senha. */
  recuperandoSenha: boolean
  concluirRecuperacao: () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Lido do fragmento já na primeira renderização: o supabase-js consome o hash
  // ao inicializar, e o evento PASSWORD_RECOVERY pode disparar antes de o
  // listener abaixo estar pronto. Sem esta leitura, o retorno do e-mail se
  // perderia justamente nesse intervalo.
  const [recuperandoSenha, setRecuperandoSenha] = useState(() =>
    hashIndicaRecuperacao(hashDeEntrada()),
  )

  const concluirRecuperacao = useCallback(() => setRecuperandoSenha(false), [])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
      })
      .catch((err) => {
        console.error('Falha ao obter sessão do Supabase:', err)
      })
      .finally(() => {
        setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (event === 'SIGNED_OUT') setRecuperandoSenha(false)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: 'E-mail ou senha inválidos.' }
    setSession(data.session)
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        recuperandoSenha,
        concluirRecuperacao,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
