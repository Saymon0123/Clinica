import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Carregando...
      </div>
    )
  }

  if (!user) {
    // Visitante na raiz vê a página de vendas; em qualquer outra rota, o login.
    //
    // A raiz é o endereço que as pessoas digitam e compartilham, e quem chega
    // por prospecção ou anúncio ainda não tem conta — receber um formulário de
    // login é a pior primeira impressão possível.
    //
    // Nas demais rotas o login continua certo: quem abriu `/financeiro` já é
    // cliente e perdeu a sessão, e mandá-lo para uma página de vendas seria
    // não reconhecer quem ele é.
    return <Navigate to={location.pathname === '/' ? '/inicio' : '/login'} replace />
  }

  return <>{children}</>
}
