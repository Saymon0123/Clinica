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
        <div key={alert.id} className="bg-white dark:bg-gray-900 border border-green-200 dark:border-green-900 rounded-lg shadow-lg p-4 relative">
          <button
            onClick={() => onDismiss(alert.id)}
            aria-label="Fechar aviso"
            className="absolute top-2 right-2 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 flex items-center justify-center shrink-0">
              <CalendarPlus size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Novo agendamento</div>
              <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{alert.clientName}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{alert.serviceName} · {alert.startsAt}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
