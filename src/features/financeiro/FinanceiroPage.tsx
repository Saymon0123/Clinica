import { useState } from 'react'
import { CalendarX, DollarSign, Users, CalendarCheck } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useFinanceiroData, type PeriodFilter } from './useFinanceiroData'

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CARD_CONFIG = [
  { key: 'faturamento', label: 'Faturamento', icon: DollarSign, format: 'currency' as const },
  { key: 'clientesAtendidos', label: 'Clientes atendidos', icon: Users, format: 'number' as const },
  { key: 'agendamentos', label: 'Agendamentos', icon: CalendarCheck, format: 'number' as const },
  { key: 'cancelamentos', label: 'Cancelamentos', icon: CalendarX, format: 'number' as const },
]

export function FinanceiroPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [filter, setFilter] = useState<PeriodFilter>('dia')
  const { summary, loading, error } = useFinanceiroData(salonId, filter)

  if (salonLoading) {
    return <p className="text-sm text-gray-500">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-gray-500">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Financeiro</h1>

        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => setFilter('dia')}
            className={`px-4 py-2 font-medium ${filter === 'dia' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Hoje
          </button>
          <button
            onClick={() => setFilter('mes')}
            className={`px-4 py-2 font-medium border-l border-gray-300 ${filter === 'mes' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Este mês
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARD_CONFIG.map(({ key, label, icon: Icon, format }) => {
          const value = summary[key as keyof typeof summary]
          return (
            <div key={key} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Icon size={16} />
                <span className="text-sm">{label}</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {loading ? '—' : format === 'currency' ? formatCurrency(value) : value}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        {filter === 'dia' ? 'Dados de hoje.' : 'Dados do mês atual.'} Faturamento considera comandas
        fechadas; clientes atendidos considera agendamentos concluídos.
      </p>
    </div>
  )
}
