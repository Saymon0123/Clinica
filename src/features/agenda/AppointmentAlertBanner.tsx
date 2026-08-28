import { CalendarPlus, X } from 'lucide-react'
import type { AppointmentAlertData } from './useAppointmentAlerts'

type Props = {
  alerts: AppointmentAlertData[]
  onDismiss: (id: string) => void
}

export function AppointmentAlertBanner({ alerts, onDismiss }: Props) {
  if (alerts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
      {alerts.map((alert) => (
        <div key={alert.id} className="bg-surface border border-border rounded-2xl shadow-lg p-4 relative">
          <button
            onClick={() => onDismiss(alert.id)}
            aria-label="Fechar aviso"
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <div className="w-9 h-9 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
              <CalendarPlus size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Novo agendamento</div>
              <div className="text-sm text-foreground truncate">{alert.clientName}</div>
              <div className="text-xs text-muted-foreground">{alert.serviceName} · {alert.startsAt}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
