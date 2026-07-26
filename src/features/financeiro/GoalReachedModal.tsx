import { useEffect, useMemo } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { playCelebrationSound } from '../../lib/sound'

const CONFETTI_COLORS = ['#6d28d9', '#a78bfa', '#10b981', '#f59e0b', '#ec4899']

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Comemoração exibida quando o faturamento do mês alcança a meta. */
export function GoalReachedModal({
  revenue,
  goal,
  onClose,
}: {
  revenue: number
  goal: number
  onClose: () => void
}) {
  // Peças de confete geradas uma vez, com posições/tempos variados.
  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.4 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 6,
        rotation: Math.random() * 360,
      })),
    [],
  )

  useEffect(() => {
    playCelebrationSound()
  }, [])

  const excedente = revenue - goal
  const pct = goal > 0 ? (revenue / goal) * 100 : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-hidden"
      onClick={onClose}
    >
      {/* Confete — respeita prefers-reduced-motion via CSS */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {confetti.map((c) => (
          <span
            key={c.id}
            className="confetti-piece"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size * 1.6,
              backgroundColor: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rotation}deg)`,
            }}
          />
        ))}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="meta-atingida-titulo"
        className="relative bg-surface rounded-2xl border border-border w-full max-w-sm p-6 text-center shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>

        <span className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-primary-soft text-primary">
          <PartyPopper size={30} />
        </span>

        <h2 id="meta-atingida-titulo" className="text-xl font-semibold text-foreground mb-1">
          Parabéns! 🎉
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Você bateu a meta de faturamento deste mês.
        </p>

        <div className="bg-surface-2 rounded-xl p-4 mb-5 space-y-1">
          <div className="text-2xl font-semibold text-foreground">{formatCurrency(revenue)}</div>
          <div className="text-xs text-muted-foreground">
            de uma meta de {formatCurrency(goal)} · {pct.toFixed(0)}% alcançado
          </div>
          {excedente > 0 && (
            <div className="text-xs font-medium text-success pt-1">
              {formatCurrency(excedente)} acima da meta
            </div>
          )}
        </div>

        <button onClick={onClose} className="w-full btn-primary rounded-lg px-3 py-2.5 text-sm font-medium">
          Continuar
        </button>
      </div>
    </div>
  )
}
