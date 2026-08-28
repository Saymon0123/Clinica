import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Estado vazio desenhado (leva 2 da modernização).
 *
 * Antes, "sem dados" era um <p> cinza — e o Catálogo nem isso tinha: mostrava
 * tabela com corpo vazio, parecendo quebrada exatamente no primeiro uso.
 * A fórmula: ícone + o que está vazio + por que isso importa + a saída (CTA).
 */
export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-soft text-primary-soft-foreground mb-3">
        <Icone size={22} />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      {descricao && <p className="text-sm text-muted-foreground mt-1 max-w-xs">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
