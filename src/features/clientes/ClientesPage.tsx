import { useMemo, useState } from 'react'
import { Inbox, Plus, Search } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useClientsData } from './useClientsData'
import { NewClientModal } from './NewClientModal'
import { ClientDetailModal } from './ClientDetailModal'
import type { Client } from './types'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function ClientesPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const { clients, loading, error, reload } = useClientsData(salonId)
  const [search, setSearch] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clients
    return clients.filter(
      (c) => c.nome.toLowerCase().includes(term) || (c.telefone ?? '').toLowerCase().includes(term),
    )
  }, [clients, search])

  if (salonLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <button
          onClick={() => setShowNewClient(true)}
          className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {!loading && clients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border flex flex-col items-center justify-center text-center py-16 px-4">
          <Inbox size={40} className="text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-semibold text-foreground mb-1">Comece a adicionar clientes</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            Cadastre os dados dos seus clientes para agilizar agendamentos e manter o histórico de atendimentos.
          </p>
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Adicionar
          </button>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border">
          <div className="p-3 border-b border-border">
            <div className="relative max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full border border-border-strong bg-surface text-foreground rounded pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Telefone</th>
                  <th className="px-4 py-2 font-medium">Aniversário</th>
                  <th className="px-4 py-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => setDetailClient(client)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground font-medium">{client.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{client.telefone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(client.aniversario)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{client.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>
      )}

      {showNewClient && (
        <NewClientModal salonId={salonId} onClose={() => setShowNewClient(false)} onCreated={reload} />
      )}

      {detailClient && !editClient && (
        <ClientDetailModal
          client={detailClient}
          onClose={() => setDetailClient(null)}
          onEdit={() => setEditClient(detailClient)}
        />
      )}

      {editClient && (
        <NewClientModal
          salonId={salonId}
          initial={editClient}
          onClose={() => {
            setEditClient(null)
            setDetailClient(null)
          }}
          onCreated={reload}
        />
      )}
    </div>
  )
}
