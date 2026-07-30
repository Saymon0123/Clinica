import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSalon } from './useSalon'

/**
 * Barra as telas de WhatsApp para quem não é dono nem gerente.
 *
 * O RLS já protege os dados (`whatsapp_conversations: gestor` exige
 * `private.is_manager`) e a edge function `whatsapp` filtra por papel, então o
 * barbeiro nunca viu conversa alguma. Mas as rotas `/web` e `/conexao` estavam
 * alcançáveis digitando a URL: ele chegava numa tela vazia com botão de
 * "Conectar WhatsApp" que sempre falharia. Parecia defeito, e contraria o
 * escopo do barbeiro (ver docs/visao.md).
 */
export function RequireManager({ children }: { children: ReactNode }) {
  const { isManager, loading } = useSalon()

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!isManager) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
