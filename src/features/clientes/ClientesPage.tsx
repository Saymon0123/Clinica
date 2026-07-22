import { useMemo, useState } from 'react'
import { Inbox, Plus, Search } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useClientsData } from './useClientsData'
import { NewClientModal } from './NewClientModal'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function ClientesPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const { clients, loading, error, reload } = useClientsData(salonId)
  const [search, setSearch] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clients
    return clients.filter(
      (c) => c.nome.toLowerCase().includes(term) || (c.telefone ?? '').toLowerCase().includes(term),
    )
  }, [clients, search])

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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Clientes</h1>
        <button
          onClick={() => setShowNewClient(true)}
          className="flex items-center gap-2 bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800"
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {!loading && clients.length === 0 ? (
        <div className="bg-white rounded-lg shadow flex flex-col items-center justify-center text-center py-16 px-4">
          <Inbox size={40} className="text-gray-300 mb-4" />
          <h2 className="text-base font-semibold text-gray-900 mb-1">Comece a adicionar clientes</h2>
          <p className="text-sm text-gray-500 mb-5 max-w-sm">
            Cadastre os dados dos seus clientes para agilizar agendamentos e manter o histórico de atendimentos.
          </p>
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800"
          >
            <Plus size={16} />
            Adicionar
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="p-3 border-b border-gray-200">
            <div className="relative max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Telefone</th>
                  <th className="px-4 py-2 font-medium">Aniversário</th>
                  <th className="px-4 py-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-gray-900 font-medium">{client.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{client.telefone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(client.aniversario)}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{client.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredClients.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>
      )}

      {showNewClient && (
        <NewClientModal salonId={salonId} onClose={() => setShowNewClient(false)} onCreated={reload} />
      )}
    </div>
  )
}
