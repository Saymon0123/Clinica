import { CalendarPlus, X } from 'lucide-react'
import type { AppointmentAlertData } from './useAppointmentAlerts'

type Props = {
  alerts: AppointmentAlertData[]
  onDismiss: (id: string) => void
}

/** Acima disto a pilha vira parede: o resto é resumido numa linha. */
const MAXIMO_NA_TELA = 3

/**
 * Os cartões de "Novo agendamento". Sem posição própria: quem os coloca na
 * tela é a `PilhaDeAvisos` do layout, abaixo do cabeçalho no celular (achado
 * 35 da revisão de 01/09). Cada cartão morre sozinho depois de
 * `TEMPO_DE_VIDA_MS` ou no X.
 */
export function AppointmentAlertBanner({ alerts, onDismiss }: Props) {
  if (alerts.length === 0) return null

  const visiveis = alerts.slice(0, MAXIMO_NA_TELA)
  const escondidos = alerts.length - visiveis.length

  return (
    <>
      {visiveis.map((alert) => (
        <div
          key={alert.id}
          role="status"
          className="bg-surface border border-border rounded-2xl shadow-lg p-4 relative"
        >
          <button
            onClick={() => onDismiss(alert.id)}
            aria-label="Fechar aviso"
            className="absolute top-1 right-1 text-muted-foreground hover:text-foreground p-2 rounded-lg"
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
              <div className="text-xs text-muted-foreground">
                {alert.serviceName} · {alert.startsAt}
              </div>
            </div>
          </div>
        </div>
      ))}
      {escondidos > 0 && (
        <p className="text-xs text-muted-foreground text-right pr-1">
          e mais {escondidos} {escondidos === 1 ? 'reserva nova' : 'reservas novas'}
        </p>
      )}
    </>
  )
}
