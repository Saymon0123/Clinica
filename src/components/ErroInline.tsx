import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Erro com cara de erro (leva 4 da modernização).
 *
 * Antes, ~40 telas mostravam falha como `<p className="text-sm text-danger">`
 * — o erro tinha o peso visual de uma legenda. Aqui ele vira um banner com
 * ícone e fundo, sem virar alarme: é para ser notado, não para gritar.
 */
export function ErroInline({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3.5 py-2.5"
    >
      <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
