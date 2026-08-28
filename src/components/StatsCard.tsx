import { useEffect, useRef, useState, type ReactNode } from 'react'

type BarPoint = { label: string; value: number; highlight?: boolean }

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf: number
    const start = performance.now()
    const duration = 700
    const from = 0
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target - from) * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active])
  return value
}

export function StatsCard({
  icon,
  label,
  value,
  formattedValue,
  badge,
  bars,
  barColor = 'bg-primary/25',
  barHighlightColor = 'bg-primary',
  hero = false,
}: {
  icon: ReactNode
  label: string
  value: number
  formattedValue: (n: number) => string
  badge?: ReactNode
  bars: BarPoint[]
  barColor?: string
  barHighlightColor?: string
  /**
   * Card preenchido no verde da marca — o destaque da fileira (referência
   * CheckinOs, "Occupancy Rate"). Um por tela: dois heróis não destacam nada.
   */
  hero?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const animatedValue = useCountUp(value, visible)
  const maxBar = Math.max(...bars.map((b) => Math.abs(b.value)), 1)

  return (
    <div
      ref={ref}
      className={
        hero
          ? 'bg-primary text-primary-foreground rounded-2xl p-4 shadow-md shadow-primary/20 transition-all duration-300 ease-out hover:-translate-y-1'
          : 'bg-surface border border-border rounded-2xl shadow-sm p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5'
      }
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={`flex items-center gap-2 ${hero ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
        >
          <span
            className={`flex items-center justify-center w-7 h-7 rounded-lg ${
              hero ? 'bg-primary-foreground/15' : 'bg-primary-soft text-primary-soft-foreground'
            }`}
          >
            {icon}
          </span>
          <span className="text-sm">{label}</span>
        </div>
        {badge}
      </div>

      <div
        className={`text-2xl mb-3 tabular-nums ${
          hero ? 'font-bold' : 'font-semibold text-foreground'
        }`}
      >
        {formattedValue(animatedValue)}
      </div>

      <div className="flex h-9 items-end gap-1">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 h-full flex items-end">
            <div
              className={`w-full rounded-sm transition-[height] duration-700 ease-out ${
                bar.highlight ? barHighlightColor : barColor
              }`}
              style={{
                height: visible ? `${Math.max((Math.abs(bar.value) / maxBar) * 100, 6)}%` : '0%',
                transitionDelay: `${i * 40}ms`,
              }}
              title={`${bar.label}: ${bar.value}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
