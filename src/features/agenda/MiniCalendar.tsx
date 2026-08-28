import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['Do', '2ª', '3ª', '4ª', '5ª', '6ª', 'Sá']
const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

type Props = {
  selectedDate: Date
  visibleMonth: Date
  onSelectDate: (date: Date) => void
  onChangeMonth: (date: Date) => void
}

export function MiniCalendar({ selectedDate, visibleMonth, onSelectDate, onChangeMonth }: Props) {
  const days = buildMonthGrid(visibleMonth)
  const today = new Date()

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          {MONTH_LABELS[visibleMonth.getMonth()]} de {visibleMonth.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
            className="p-1 text-muted-foreground hover:bg-surface-2 rounded-md"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
            className="p-1 text-muted-foreground hover:bg-surface-2 rounded-md"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = d.getMonth() === visibleMonth.getMonth()
          const isSelected = isSameDay(d, selectedDate)
          const isToday = isSameDay(d, today)
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              className={`relative aspect-square rounded-full text-xs tabular-nums flex items-center justify-center
                ${isSelected ? 'btn-primary font-semibold' : inMonth ? 'text-foreground hover:bg-surface-2' : 'text-muted-foreground/40'}
                ${isToday && !isSelected ? 'font-semibold text-primary' : ''}
              `}
            >
              {d.getDate()}
              {/* Hoje = ponto sob o número, no verde da marca. O anel cinza de
                  antes usava cores cruas do Tailwind, fora do sistema de tokens. */}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
