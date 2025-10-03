'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import {
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Users,
  Stethoscope,
  FileText,
} from 'lucide-react'
import clsx from 'clsx'

interface DashboardStats {
  total_appointments: number
  appointments_by_status: {
    CONFIRMADO?: number
    PENDENTE?: number
    CANCELADO?: number
    CONCLUIDO?: number
  }
  appointments_by_type: {
    CONSULTA?: number
    EXAME?: number
  }
  upcoming_appointments: number
  today_appointments: number
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      const response = await api.get('/api/appointments/dashboard')
      setStats(response.data)
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total de Agendamentos',
      value: stats?.total_appointments || 0,
      icon: Calendar,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Agendamentos Hoje',
      value: stats?.today_appointments || 0,
      icon: Clock,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: 'Próximos Agendamentos',
      value: stats?.upcoming_appointments || 0,
      icon: TrendingUp,
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Consultas',
      value: stats?.appointments_by_type?.CONSULTA || 0,
      icon: Stethoscope,
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
  ]

  const statusCards = [
    {
      title: 'Confirmados',
      value: stats?.appointments_by_status?.CONFIRMADO || 0,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Pendentes',
      value: stats?.appointments_by_status?.PENDENTE || 0,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: 'Cancelados',
      value: stats?.appointments_by_status?.CANCELADO || 0,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Concluídos',
      value: stats?.appointments_by_status?.CONCLUIDO || 0,
      icon: CheckCircle,
      color: 'text-blue-600 dark:text-blue-400',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-bold mb-2">
          Bem-vindo, {user?.full_name}! 👋
        </h1>
        <p className="text-white/90">
          {user?.role === 'ADM' 
            ? 'Painel completo de administração do sistema'
            : 'Gerencie seus agendamentos e visualize suas estatísticas'
          }
        </p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={clsx('p-3 rounded-lg', stat.bgColor)}>
                <stat.icon className={clsx('w-6 h-6', stat.iconColor)} />
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {stat.title}
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Status Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          Status dos Agendamentos
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statusCards.map((status, index) => (
            <div
              key={index}
              className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <status.icon className={clsx('w-8 h-8 mx-auto mb-2', status.color)} />
              <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {status.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button
          onClick={() => window.location.href = '/dashboard/agendamentos/novo'}
          className="bg-gradient-to-r from-primary-500 to-secondary-500 hover:from-primary-600 hover:to-secondary-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        >
          <Calendar className="w-8 h-8 mb-3" />
          <h3 className="text-lg font-semibold mb-1">Novo Agendamento</h3>
          <p className="text-sm text-white/90">Criar um novo agendamento</p>
        </button>

        <button
          onClick={() => window.location.href = '/dashboard/agendamentos'}
          className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2 border-gray-200 dark:border-gray-700"
        >
          <FileText className="w-8 h-8 mb-3 text-primary-600 dark:text-primary-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Ver Agendamentos
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Lista completa de agendamentos
          </p>
        </button>

        {user?.role === 'ADM' && (
          <button
            onClick={() => window.location.href = '/dashboard/usuarios'}
            className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2 border-gray-200 dark:border-gray-700"
          >
            <Users className="w-8 h-8 mb-3 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Gerenciar Usuários
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Adicionar e editar usuários
            </p>
          </button>
        )}
      </div>
    </div>
  )
}
