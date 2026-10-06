import { useEffect, useRef, useState, type ReactNode } from 'react'
import { alturaDaBarra } from './alturaDaBarra'

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
  eixo,
  barColor = 'bg-primary/40',
  barHighlightColor = 'bg-primary',
  hero = false,
  detalhe,
}: {
  icon: ReactNode
  label: string
  value: number
  formattedValue: (n: number) => string
  badge?: ReactNode
  /**
   * Linha curta ao lado do número — a divisão de uma soma ("3 cancelados · 2
   * não vieram"). Na mesma linha do número, e não embaixo, para os gráficos da
   * fileira continuarem alinhados; só quebra quando o card é estreito demais.
   */
  detalhe?: ReactNode
  bars: BarPoint[]
  /**
   * As duas pontas do eixo do mini-gráfico ("1 out" … "hoje"). Sem elas o
   * desenho não diz o que é: são 5 barras no dia 5 do mês, 31 no fim dele e 7
   * no filtro por dia, e nada na tela explicava a diferença.
   */
  eixo?: [string, string]
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
          ? 'heroi-superficie text-primary-foreground rounded-2xl p-4 shadow-md shadow-primary/20 transition-all duration-300 ease-out hover:-translate-y-1'
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

      <div className="flex flex-wrap items-baseline gap-x-2 mb-3">
        <div className={`num-destaque text-2xl ${hero ? '' : 'text-foreground'}`}>
          {formattedValue(animatedValue)}
        </div>
        {detalhe && (
          <span className={`text-xs ${hero ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
            {detalhe}
          </span>
        )}
      </div>

      {/* O vão encolhe quando o mês cresce: 4px servem para os 7 dias do filtro
          "Dia", mas num mês de 31 barras eles comem 120px dos ~300 do card e o
          gráfico vira um pente. */}
      <div
        className={`flex h-9 items-end border-b ${bars.length > 10 ? 'gap-0.5' : 'gap-1'} ${
          bars.length === 0
            ? 'border-transparent'
            : hero
              ? 'border-primary-foreground/25'
              : 'border-border-strong'
        }`}
      >
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 h-full flex items-end">
            <div
              className={`w-full rounded-t-sm transition-[height] duration-700 ease-out ${
                bar.highlight ? barHighlightColor : barColor
              }`}
              style={{
                height: visible ? alturaDaBarra(bar.value, maxBar) : '0%',
                transitionDelay: `${i * 40}ms`,
              }}
              title={`${bar.label} · ${formattedValue(bar.value)}`}
            />
          </div>
        ))}
      </div>

      {/* A linha do eixo sai mesmo vazia: o card de comissão do barbeiro não
          tem gráfico, e sem este espaço ele ficaria mais baixo que os outros
          três da mesma fileira. */}
      <div
        className={`flex justify-between text-[11px] mt-1.5 ${
          hero ? 'text-primary-foreground/75' : 'text-muted-foreground'
        }`}
      >
        <span>{eixo ? eixo[0] : ' '}</span>
        <span>{eixo ? eixo[1] : ''}</span>
      </div>
    </div>
  )
}
