import { NavLink, Outlet } from 'react-router-dom'
import { Calendar, Users, Wallet, Link2, LogOut, Globe } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useSalon } from '../features/auth/useSalon'
import { useAppointmentAlerts } from '../features/agenda/useAppointmentAlerts'
import { AppointmentAlertBanner } from '../features/agenda/AppointmentAlertBanner'
import { usePendingConversations } from '../features/whatsappWeb/usePendingConversations'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { to: '/', label: 'Agenda', icon: Calendar },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/conexao', label: 'Conexão', icon: Link2 },
]

export function AppLayout() {
  const { signOut } = useAuth()
  const { salonId } = useSalon()
  const { alerts, dismiss } = useAppointmentAlerts(salonId)
  const { hasPending } = usePendingConversations(salonId)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-950">
      {/* Topbar (mobile only) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <span className="font-semibold text-gray-900 dark:text-gray-100">Salão CRM</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => signOut()}
            aria-label="Sair"
            className="p-2 -mr-2 text-gray-500 dark:text-gray-400 active:text-gray-900 dark:active:text-gray-100"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-56 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-col shrink-0">
        <div className="px-4 py-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Salão CRM</span>
          <ThemeToggle />
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm ${
                  isActive
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 w-full">
        <Outlet />
      </main>

      {/* Bottom nav (mobile only) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Botão flutuante: abre o espelho do WhatsApp em nova aba (só desktop) */}
      <button
        onClick={() => window.open('/web', '_blank', 'noopener,noreferrer')}
        className={`hidden md:flex fixed bottom-6 right-4 z-20 items-center gap-2 text-white rounded-full pl-3 pr-4 py-3 shadow-lg transition-colors ${
          hasPending ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        <Globe size={18} />
        <span className="text-sm font-semibold">WEB</span>
      </button>

      <AppointmentAlertBanner alerts={alerts} onDismiss={dismiss} />
    </div>
  )
}
