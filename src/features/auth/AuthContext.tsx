import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { hashDeEntrada, hashIndicaRecuperacao } from '../../lib/recuperacaoSenha'
import { mensagemDeErroDeLogin } from '../../lib/authErrors'

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

  // `useCallback` e `useMemo` aqui não são otimização, são correção.
  //
  // Sem eles, `value` e as funções eram recriados a cada render. O
  // `SalonProvider` consome `signOut` na lista de dependências do `carregar`,
  // então: render do AuthProvider → `signOut` novo → `carregar` novo → o efeito
  // dispara → `setUnidades` com um array novo → render → `signOut` novo... um
  // laço infinito, refazendo a consulta de vínculos sem parar.
  //
  // O estrago maior era colateral: o `loading` do salão oscilava, o
  // `RequireManager` alternava entre "Carregando..." e a tela, e isso
  // **desmontava e remontava** a página a cada volta. Em telas sem estado local
  // passava despercebido; na aba WEB, a conversa selecionada era zerada antes
  // de aparecer — dava para ver as mensagens sendo buscadas e a tela continuar
  // dizendo "Selecione uma conversa".
  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // O console guarda o erro cru: a mensagem da tela é para o usuário, o
      // log é para quem vai depurar.
      console.error('Falha ao entrar:', error)
      return { error: mensagemDeErroDeLogin(error) }
    }
    setSession(data.session)
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      recuperandoSenha,
      concluirRecuperacao,
      signIn,
      signOut,
    }),
    [session, loading, recuperandoSenha, concluirRecuperacao, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
