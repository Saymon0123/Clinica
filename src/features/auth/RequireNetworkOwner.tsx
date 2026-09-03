import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSalon } from './useSalon'
import { SkeletonPagina } from '../../components/Skeleton'

/**
 * Barra as telas da rede para quem não é dono.
 *
 * Esconder o item no menu não basta: `/rede` e `/rede/equipe` continuariam
 * acessíveis digitando a URL. Gerente e barbeiro são mandados de volta para
 * a agenda.
 */
export function RequireNetworkOwner({ children }: { children: ReactNode }) {
  const { podeVerRede, loading } = useSalon()

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonPagina />
      </div>
    )
  }

  if (!podeVerRede) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
