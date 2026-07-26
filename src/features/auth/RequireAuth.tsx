import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Carregando...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}
