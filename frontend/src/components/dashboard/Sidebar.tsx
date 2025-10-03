'use client'

import { useAuthStore } from '@/store/authStore'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Bell,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, isAdmin } = useAuthStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: true },
    { name: 'Agendamentos', href: '/dashboard/agendamentos', icon: Calendar, show: true },
    { name: 'Usuários', href: '/dashboard/usuarios', icon: Users, show: isAdmin() },
    { name: 'Relatórios', href: '/dashboard/relatorios', icon: FileText, show: true },
    { name: 'Notificações', href: '/dashboard/notificacoes', icon: Bell, show: true },
    { name: 'Configurações', href: '/dashboard/configuracoes', icon: Settings, show: true },
  ].filter(item => item.show)

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-lg"
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>
      </div>

      {/* Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300',
          {
            '-translate-x-full lg:translate-x-0': !isMobileMenuOpen,
            'translate-x-0': isMobileMenuOpen,
          }
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
                  MedSchedule
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {user?.role === 'ADM' ? 'Administrador' : 'Funcionário'}
                </p>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* User info */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-semibold">
                {user?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.full_name}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {user?.specialty || 'Sem especialidade'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    {
                      'bg-gradient-to-r from-primary-500 to-secondary-500 text-white shadow-lg': isActive,
                      'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700': !isActive,
                    }
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sair</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
