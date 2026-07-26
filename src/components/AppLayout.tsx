import { NavLink, Outlet } from 'react-router-dom'
import { Calendar, Users, Wallet, Link2, LogOut, Globe, Tag, Scissors, UsersRound, Building2 } from 'lucide-react'
import { UnitSwitcher } from './UnitSwitcher'
import { useAuth } from '../features/auth/AuthContext'
import { useSalon } from '../features/auth/useSalon'
import { useAppointmentAlerts } from '../features/agenda/useAppointmentAlerts'
import { AppointmentAlertBanner } from '../features/agenda/AppointmentAlertBanner'
import { usePendingConversations } from '../features/whatsappWeb/usePendingConversations'
import { ThemeToggle } from './ThemeToggle'

type NavItem = {
  to: string
  label: string
  icon: typeof Calendar
  somenteGestor?: boolean
  somenteRede?: boolean
}

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
      { to: '/equipe', label: 'Equipe', icon: UsersRound, somenteGestor: true },
      { to: '/rede', label: 'Rede', icon: Building2, somenteGestor: true, somenteRede: true },
    ],
  },
  {
    title: 'WhatsApp',
    items: [{ to: '/conexao', label: 'Conexão', icon: Link2, somenteGestor: true }],
  },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `group flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] font-medium tracking-wide transition-all duration-200 ${
    isActive
      ? 'bg-primary-soft text-primary-soft-foreground'
      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
  }`
}

export function AppLayout() {
  const { signOut } = useAuth()
  const { salonId, salonName, isManager, isNetwork } = useSalon()
  const { alerts, dismiss } = useAppointmentAlerts(salonId)
  const { hasPending } = usePendingConversations(isManager ? salonId : null)

  // Barbeiro não enxerga itens de gestão (o banco também bloqueia os dados).
  // "Rede" só faz sentido para quem administra mais de uma unidade.
  const gruposVisiveis = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (!i.somenteGestor || isManager) && (!i.somenteRede || isNetwork),
    ),
  })).filter((g) => g.items.length > 0)
  const itensVisiveis = gruposVisiveis.flatMap((g) => g.items)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Topbar (mobile only) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={16} />
          </span>
          <span className="font-semibold text-foreground">{salonName ?? 'Salão CRM'}</span>
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
        <div className="px-3 py-4">
          <div className="flex items-center justify-between px-2 py-2 rounded-lg select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-[6px] bg-primary text-primary-foreground font-semibold text-[13px] shrink-0 shadow-sm">
                {salonName ? salonName.charAt(0).toUpperCase() : <Scissors size={16} />}
              </span>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[13px] font-medium leading-none mb-1 text-foreground truncate">
                  {salonName ?? 'Salão CRM'}
                </span>
                <span className="text-[11px] text-muted-foreground leading-none">
                  {isManager ? 'Painel do dono' : 'Barbeiro'}
                </span>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <UnitSwitcher />

        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          {gruposVisiveis.map((group) => (
            <div key={group.title}>
              <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.title}
              </p>
              <div className="space-y-0.5">
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
        {itensVisiveis.map((item) => (
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

      {/* Botão flutuante: abre o espelho do WhatsApp em nova aba (só desktop, só gestor) */}
      {isManager && (
      <button
        onClick={() => window.open('/web', '_blank', 'noopener,noreferrer')}
        className={`hidden md:flex fixed bottom-6 right-4 z-20 items-center gap-2 text-white rounded-full pl-3 pr-4 py-3 shadow-lg transition-colors ${
          hasPending ? 'bg-danger hover:brightness-95 animate-pulse' : 'bg-primary hover:bg-primary-hover'
        }`}
      >
        <Globe size={18} />
        <span className="text-sm font-semibold">WEB</span>
      </button>
      )}

      <AppointmentAlertBanner alerts={alerts} onDismiss={dismiss} />
    </div>
  )
}
