import type { ReactNode } from 'react'

/**
 * O badge de status único do CRM (leva 2 da modernização).
 *
 * Antes, "ativo" era success no Catálogo, cinza na Equipe e primary na Rede —
 * três cores para o mesmo estado — em três tamanhos de fonte (10/11/12px).
 * Aqui o mapa fecha:
 *
 * - `ok`      → coisa saudável/vigente (ativo, pago, conectado, concluído)
 * - `atencao` → precisa de olho (pendente, vencendo, aguardando)
 * - `perigo`  → problema (atrasado, cancelado, falhou)
 * - `neutro`  → estado sem carga (inativo, arquivado, rascunho)
 * - `marca`   → destaque da marca, sem semântica de saúde (papel, plano)
 *
 * O ponto à esquerda faz o estado ler-se de relance, sem depender só da cor.
 */
const VARIANTES = {
  ok: 'bg-success-soft text-success',
  atencao: 'bg-warning/15 text-warning',
  perigo: 'bg-danger-soft text-danger',
  neutro: 'bg-surface-2 text-muted-foreground',
  marca: 'bg-primary-soft text-primary-soft-foreground',
} as const

export function Badge({
  variante = 'neutro',
  children,
}: {
  variante?: keyof typeof VARIANTES
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${VARIANTES[variante]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden />
      {children}
    </span>
  )
}
