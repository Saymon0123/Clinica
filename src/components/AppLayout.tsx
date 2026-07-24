import { NavLink, Outlet } from 'react-router-dom'
import { Calendar, Users, Wallet, Link2, LogOut, Globe, Tag, Scissors } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useSalon } from '../features/auth/useSalon'
import { useAppointmentAlerts } from '../features/agenda/useAppointmentAlerts'
import { AppointmentAlertBanner } from '../features/agenda/AppointmentAlertBanner'
import { usePendingConversations } from '../features/whatsappWeb/usePendingConversations'
import { ThemeToggle } from './ThemeToggle'

type NavItem = { to: string; label: string; icon: typeof Calendar }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Agenda', icon: Calendar },
      { to: '/financeiro', label: 'Financeiro', icon: Wallet },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/catalogo', label: 'Catálogo', icon: Tag },
    ],
  },
  {
    title: 'WhatsApp',
    items: [{ to: '/conexao', label: 'Conexão', icon: Link2 }],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-soft text-primary-soft-foreground'
      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
  }`
}

export function AppLayout() {
  const { signOut } = useAuth()
  const { salonId } = useSalon()
  const { alerts, dismiss } = useAppointmentAlerts(salonId)
  const { hasPending } = usePendingConversations(salonId)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Topbar (mobile only) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={16} />
          </span>
          <span className="font-semibold text-foreground">Salão CRM</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => signOut()}
            aria-label="Sair"
            className="p-2 -mr-2 text-muted-foreground active:text-foreground"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-60 border-r border-sidebar-border bg-sidebar flex-col shrink-0">
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <Scissors size={18} />
            </span>
            <span className="font-semibold text-foreground">Salão CRM</span>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 px-3 py-2 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 mx-3 mb-3 px-3 py-2 rounded-lg text-sm font-medium text-left text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
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
        className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-sidebar-border flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {ALL_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-primary' : 'text-muted-foreground'
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
          hasPending ? 'bg-danger hover:brightness-95 animate-pulse' : 'bg-primary hover:bg-primary-hover'
        }`}
      >
        <Globe size={18} />
        <span className="text-sm font-semibold">WEB</span>
      </button>

      <AppointmentAlertBanner alerts={alerts} onDismiss={dismiss} />
    </div>
  )
}
