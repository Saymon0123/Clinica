import { useMemo, useState } from 'react'
import { Download, Inbox, Plus, Search, Upload, UserPlus } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useClientsData } from './useClientsData'
import { NewClientModal } from './NewClientModal'
import { ClientDetailModal } from './ClientDetailModal'
import { ImportClientsModal } from './ImportClientsModal'
import { buildCsv, downloadCsv } from '../../lib/csv'
import { formatarTelefone, linkWhatsApp, somenteDigitos } from '../../lib/telefone'
import { Tabela, Th, Td } from '../../components/Tabela'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonPagina } from '../../components/Skeleton'
import { Input } from '../../components/Campo'
import { PageHeader } from '../../components/PageHeader'
import type { Client } from './types'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** "há 12 dias" / "ontem" / "hoje" — a pergunta real é "quem sumiu?". */
function formatUltimaVisita(iso: string | null) {
  if (!iso) return { texto: 'nunca veio', dias: null as number | null }
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return { texto: 'hoje', dias }
  if (dias === 1) return { texto: 'ontem', dias }
  return { texto: `há ${dias} dias`, dias }
}

export function ClientesPage() {
  const { salonId, isManager, loading: salonLoading } = useSalon()
  const { clients, loading, error, reload } = useClientsData(salonId)
  const [search, setSearch] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [importing, setImporting] = useState(false)
  const [novosPeriodo, setNovosPeriodo] = useState<'mes' | 'semana'>('mes')
  const [ordem, setOrdem] = useState<'nome' | 'ultima_visita'>('nome')

  // Clientes novos no período escolhido
  const novosCount = useMemo(() => {
    const agora = new Date()
    const inicio =
      novosPeriodo === 'semana'
        ? (() => {
            const d = new Date(agora)
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
            d.setHours(0, 0, 0, 0)
            return d
          })()
        : new Date(agora.getFullYear(), agora.getMonth(), 1)
    return clients.filter((c) => new Date(c.created_at) >= inicio).length
  }, [clients, novosPeriodo])

  function handleExport() {
    const csv = buildCsv(
      ['Nome', 'Telefone', 'Aniversário', 'Observação', 'Cadastrado em'],
      clients.map((c) => [
        c.nome,
        c.telefone ?? '',
        c.aniversario ? new Date(c.aniversario + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        c.observacao ?? '',
        new Date(c.created_at).toLocaleDateString('pt-BR'),
      ]),
    )
    downloadCsv(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase()
    const termDigitos = somenteDigitos(term)
    let lista = clients
    if (term) {
      // Telefone compara por dígitos: "(41) 9..." e "41 9..." são o mesmo número.
      lista = clients.filter(
        (c) =>
          c.nome.toLowerCase().includes(term) ||
          (termDigitos.length > 0 && somenteDigitos(c.telefone ?? '').includes(termDigitos)),
      )
    }
    if (ordem === 'ultima_visita') {
      // Quem está há mais tempo sem vir primeiro; quem nunca veio no fim.
      lista = [...lista].sort((a, b) => {
        if (!a.ultima_visita) return 1
        if (!b.ultima_visita) return -1
        return new Date(a.ultima_visita).getTime() - new Date(b.ultima_visita).getTime()
      })
    }
    return lista
  }, [clients, search, ordem])

  if (salonLoading) {
    return <SkeletonPagina />
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
      <PageHeader titulo="Clientes" subtitulo="Quem já passou pela sua cadeira" acoes={<>
          {isManager && (
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-2 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Upload size={16} />
              Importar
            </button>
          )}
          {isManager && (
          <button
            onClick={handleExport}
            disabled={clients.length === 0}
            className="flex items-center gap-2 btn-secondary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Download size={16} />
            Exportar
          </button>
          )}
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Adicionar
          </button>
      </>} />

      {clients.length > 0 && (
        <div className="bg-surface border border-border rounded-xl shadow-sm p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary-soft-foreground">
              <UserPlus size={18} />
            </span>
            <div>
              <div className="text-xl font-semibold text-foreground leading-tight">{novosCount}</div>
              <div className="text-xs text-muted-foreground">
                cliente{novosCount === 1 ? '' : 's'} novo{novosCount === 1 ? '' : 's'} ·{' '}
                {novosPeriodo === 'semana' ? 'esta semana' : 'este mês'}
              </div>
            </div>
          </div>

          <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm">
            <button
              onClick={() => setNovosPeriodo('semana')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                novosPeriodo === 'semana' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setNovosPeriodo('mes')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                novosPeriodo === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Mês
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {!loading && clients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm flex flex-col items-center justify-center text-center py-16 px-4">
          <Inbox size={40} className="text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-semibold text-foreground mb-1">Comece a adicionar clientes</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            Cadastre os dados dos seus clientes para agilizar agendamentos e manter o histórico de atendimentos.
          </p>
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Adicionar
          </button>
        </div>
      ) : (
        <div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-3 mb-3">
            <div className="relative max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="pl-9"
              />
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="bg-surface rounded-xl border border-border shadow-sm">
              <EstadoVazio
                icone={Search}
                titulo="Nenhum cliente encontrado."
                descricao="Tente buscar por outro nome ou telefone."
              />
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>
                    <button
                      onClick={() => setOrdem('nome')}
                      className={ordem === 'nome' ? 'text-foreground' : 'hover:text-foreground'}
                    >
                      Nome{ordem === 'nome' ? ' ↑' : ''}
                    </button>
                  </Th>
                  <Th>Telefone</Th>
                  <Th>
                    <button
                      onClick={() => setOrdem('ultima_visita')}
                      title="Ordenar por quem está há mais tempo sem vir"
                      className={ordem === 'ultima_visita' ? 'text-foreground' : 'hover:text-foreground'}
                    >
                      Última visita{ordem === 'ultima_visita' ? ' ↑' : ''}
                    </button>
                  </Th>
                  <Th>Aniversário</Th>
                  <Th>Observação</Th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => setDetailClient(client)}
                    className="border-b border-border/60 last:border-b-0 cursor-pointer hover:bg-surface-2/60 transition-colors"
                  >
                    <Td className="text-foreground font-medium">{client.nome}</Td>
                    <Td className="text-muted-foreground whitespace-nowrap">
                      {client.telefone ? (
                        linkWhatsApp(client.telefone) ? (
                          <a
                            href={linkWhatsApp(client.telefone)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Abrir conversa no WhatsApp"
                            className="text-primary hover:underline"
                          >
                            {formatarTelefone(client.telefone)}
                          </a>
                        ) : (
                          formatarTelefone(client.telefone)
                        )
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {(() => {
                        const uv = formatUltimaVisita(client.ultima_visita)
                        return (
                          <span
                            className={
                              uv.dias !== null && uv.dias >= 45
                                ? 'text-danger'
                                : 'text-muted-foreground'
                            }
                          >
                            {uv.texto}
                          </span>
                        )
                      })()}
                    </Td>
                    <Td className="text-muted-foreground">{formatDate(client.aniversario)}</Td>
                    <Td className="text-muted-foreground max-w-xs truncate">{client.observacao ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      )}

      {importing && (
        <ImportClientsModal salonId={salonId} onClose={() => setImporting(false)} onImported={reload} />
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
