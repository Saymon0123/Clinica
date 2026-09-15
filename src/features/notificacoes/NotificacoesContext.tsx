import { createContext, useContext, type ReactNode } from 'react'
import { useNotificacoes } from './useNotificacoes'

type Valor = ReturnType<typeof useNotificacoes>

const NotificacoesContext = createContext<Valor | null>(null)

/**
 * UM estado de notificações por shell, por mais que o sino apareça duas vezes.
 *
 * O AppLayout monta o sino no cabeçalho do celular E no rodapé da sidebar — os
 * dois SEMPRE montados, só a visibilidade é CSS. Com cada um chamando
 * `useNotificacoes`, os dois abriam o canal realtime com o MESMO nome
 * (`notificacoes_<salonId>`): o supabase-js devolve o mesmo canal para o mesmo
 * tópico, o primeiro já tinha dado `subscribe()`, e o segundo, ao pendurar o
 * callback, derrubava o app inteiro — "cannot add postgres_changes callbacks
 * after subscribe()" (Sentry REACT-NATIVE-7, 15/09). Foi a PRIMEIRA tela de
 * quem criou a primeira barbearia depois do sino entrar: ninguém tinha logado
 * com salão desde o merge.
 *
 * Aqui o hook roda uma vez e os sinos leem o resultado — uma busca, um canal,
 * um contador.
 */
export function NotificacoesProvider({
  salonId,
  children,
}: {
  salonId: string | null
  children: ReactNode
}) {
  const valor = useNotificacoes(salonId)
  return <NotificacoesContext.Provider value={valor}>{children}</NotificacoesContext.Provider>
}

export function useNotificacoesDoShell(): Valor {
  const ctx = useContext(NotificacoesContext)
  if (!ctx) {
    throw new Error('useNotificacoesDoShell precisa estar dentro de <NotificacoesProvider>.')
  }
  return ctx
}
