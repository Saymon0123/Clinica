import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  Calendar,
  Users,
  Wallet,
  Link2,
  Globe,
  Tag,
  Scissors,
  UsersRound,
  Building2,
  CreditCard,
} from 'lucide-react'
import { ProfileMenu } from './ProfileMenu'
import { BottomNav } from './BottomNav'
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
  somenteDono?: boolean
  /** Visível para dono, mesmo sem rede (barbearia avulsa também assina). */
  donoDeQualquerUnidade?: boolean
  /** Continua acessível mesmo sem barbearia escolhida. */
  semUnidade?: boolean
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
      { to: '/clientes', label: 'Clientes', icon: Users, somenteGestor: true },
      { to: '/catalogo', label: 'Catálogo', icon: Tag },
      { to: '/equipe', label: 'Equipe', icon: UsersRound, somenteGestor: true },
      { to: '/rede', label: 'Rede', icon: Building2, somenteDono: true, semUnidade: true },
      { to: '/rede/equipe', label: 'Equipe da rede', icon: UsersRound, somenteDono: true, semUnidade: true },
      { to: '/assinatura', label: 'Assinatura', icon: CreditCard, donoDeQualquerUnidade: true },
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
  const { salonId, salonName, isManager, isOwner, isNetwork, loading } = useSalon()
  const location = useLocation()
  const { alerts, dismiss } = useAppointmentAlerts(salonId)
  const { hasPending } = usePendingConversations(isManager ? salonId : null)

  // "Rede" e "Equipe da rede" são exclusivas do dono de mais de uma unidade.
  // Gerente e barbeiro nunca veem, mesmo administrando a unidade inteira.
  const podeVerRede = isOwner && isNetwork

  // Barbeiro fica só com Agenda, Financeiro e Catálogo (o banco também
  // bloqueia o resto). Enquanto o dono não escolher uma barbearia, o menu
  // mostra apenas as telas da rede — as outras não teriam salon_id.
  const gruposVisiveis = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.somenteGestor || isManager) &&
        (!i.somenteDono || podeVerRede) &&
        (!i.donoDeQualquerUnidade || isOwner) &&
        (i.semUnidade || !!salonId),
    ),
  })).filter((g) => g.items.length > 0)
  const itensVisiveis = gruposVisiveis.flatMap((g) => g.items)

  // Dono de rede entra pelo painel: sem barbearia escolhida, as demais telas
  // não teriam o que carregar.
  if (!loading && !salonId && podeVerRede && !location.pathname.startsWith('/rede')) {
    return <Navigate to="/rede" replace />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Topbar (mobile only) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Scissors size={16} />
          </span>
          <span className="font-semibold text-foreground truncate">{salonName ?? 'Rede'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </header>

      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-60 border-r border-sidebar-border bg-sidebar flex-col shrink-0">
        <div className="px-3 py-4">
          <div className="flex items-center justify-between gap-2">
            <ProfileMenu />
            <ThemeToggle />
          </div>
        </div>

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

      </aside>

      {/* Content */}
      {/* pb-28: a barra do celular flutua, então precisa de folga maior que
          a altura dela para o último item da tela não ficar por baixo. */}
      <main className="flex-1 p-4 md:p-6 pb-28 md:pb-6 w-full">
        <Outlet />
      </main>

      <BottomNav itens={itensVisiveis} />

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
