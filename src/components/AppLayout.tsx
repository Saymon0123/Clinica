import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Agenda' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/estoque', label: 'Estoque' },
  { to: '/profissionais', label: 'Profissionais' },
]

export function AppLayout() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 border-r border-gray-200 bg-white flex flex-col">
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
                `block px-4 py-2 text-sm ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => signOut()}
          className="px-4 py-3 text-sm text-left text-gray-500 border-t border-gray-200 hover:bg-gray-100"
        >
          Sair
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
