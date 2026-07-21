import { NavLink, Outlet } from 'react-router-dom'
import { Calendar, Users, Wallet, Package, UserCog, LogOut } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Agenda', icon: Calendar },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/estoque', label: 'Estoque', icon: Package },
  { to: '/profissionais', label: 'Equipe', icon: UserCog },
]

export function AppLayout() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Topbar (mobile only) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 sticky top-0 z-10">
        <span className="font-semibold text-gray-900">Salão CRM</span>
        <button
          onClick={() => signOut()}
          aria-label="Sair"
          className="p-2 -mr-2 text-gray-500 active:text-gray-900"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-56 border-r border-gray-200 bg-white flex-col shrink-0">
        <div className="px-4 py-4 font-semibold text-gray-900 border-b border-gray-200">
          Salão CRM
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
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
          className="flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 border-t border-gray-200 hover:bg-gray-100"
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
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-gray-900' : 'text-gray-400'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
