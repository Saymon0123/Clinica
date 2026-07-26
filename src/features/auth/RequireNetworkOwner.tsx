import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSalon } from './useSalon'

/**
 * Barra as telas da rede para quem não é dono.
 *
 * Esconder o item no menu não basta: `/rede` e `/rede/equipe` continuariam
 * acessíveis digitando a URL. Gerente e barbeiro são mandados de volta para
 * a agenda.
 */
export function RequireNetworkOwner({ children }: { children: ReactNode }) {
  const { isOwner, isNetwork, loading } = useSalon()

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!isOwner || !isNetwork) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
