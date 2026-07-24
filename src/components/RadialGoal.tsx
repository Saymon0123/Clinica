import { useEffect, useState } from 'react'

export function RadialGoal({ percent, size = 180 }: { percent: number; size?: number }) {
  const [animatedPercent, setAnimatedPercent] = useState(0)
  const clamped = Math.max(0, Math.min(percent, 100))

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimatedPercent(clamped))
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const strokeWidth = size * 0.11
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - animatedPercent / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="radialGoalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--chart-line)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--chart-track)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#radialGoalGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)',
            filter: 'drop-shadow(0 2px 6px color-mix(in srgb, var(--primary) 35%, transparent))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-foreground tabular-nums">{clamped.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground">da meta</span>
      </div>
    </div>
  )
}
