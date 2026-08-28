/**
 * Skeleton de carregamento (leva 2 da modernização).
 *
 * Substitui os ~20 "Carregando..." em texto puro: em vez de um flash de texto
 * cinza seguido de layout shift, a tela mostra a silhueta do que vem, pulsando.
 * `animate-pulse` já respeita prefers-reduced-motion via o bloco global do CSS.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-2 ${className}`} />
}

/** Atalho para o caso mais comum: n linhas de texto fantasma. */
export function SkeletonLinhas({ linhas = 3 }: { linhas?: number }) {
  const larguras = ['w-3/5', 'w-4/5', 'w-2/5', 'w-3/4', 'w-1/2']
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${larguras[i % larguras.length]}`} />
      ))}
    </div>
  )
}

/** Silhueta de página: título + card com linhas. Para os loadings de rota. */
export function SkeletonPagina() {
  return (
    <div aria-hidden>
      <Skeleton className="h-6 w-40 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />
      <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
        <SkeletonLinhas linhas={4} />
      </div>
    </div>
  )
}
