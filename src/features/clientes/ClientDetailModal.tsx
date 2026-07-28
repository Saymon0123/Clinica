import { useEffect, useState } from 'react'
import { CalendarCheck, Pencil, Receipt, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Client } from './types'
import { SaldoPacotes } from '../pacotes/SaldoPacotes'

type HistoryAppointment = {
  id: string
  data_hora_inicio: string
  status: string
  services: { nome: string } | { nome: string }[] | null
}

type HistoryOrder = {
  id: string
  closed_at: string | null
  order_items: { quantidade: number; preco_unitario: number }[]
}

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ClientDetailModal({
  client,
  onClose,
  onEdit,
}: {
  client: Client
  onClose: () => void
  onEdit: () => void
}) {
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([])
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appts, ords] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, data_hora_inicio, status, services(nome)')
          .eq('client_id', client.id)
          .order('data_hora_inicio', { ascending: false })
          .limit(15),
        supabase
          .from('orders')
          .select('id, closed_at, order_items(quantidade, preco_unitario)')
          .eq('client_id', client.id)
          .eq('status', 'fechada')
          .order('closed_at', { ascending: false })
          .limit(15),
      ])
      setAppointments((appts.data ?? []) as unknown as HistoryAppointment[])
      setOrders((ords.data ?? []) as unknown as HistoryOrder[])
      setLoading(false)
    }
    load()
  }, [client.id])

  const totalSpent = orders.reduce(
    (acc, o) => acc + o.order_items.reduce((a, i) => a + i.quantidade * Number(i.preco_unitario), 0),
    0,
  )
  const completedCount = appointments.filter((a) => a.status === 'concluido').length

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">{client.nome}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              aria-label="Editar cliente"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-surface-2"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-surface-2"
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{client.telefone ?? 'Sem telefone'}</p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Total gasto</div>
            <div className="text-lg font-semibold text-foreground">{formatCurrency(totalSpent)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Atendimentos concluídos</div>
            <div className="text-lg font-semibold text-foreground">{completedCount}</div>
          </div>
        </div>

        <SaldoPacotes clientId={client.id} />

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando histórico...</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <CalendarCheck size={13} />
                Agendamentos recentes
              </h3>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {appointments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm bg-surface-2 rounded px-3 py-2">
                      <span className="text-foreground truncate">
                        {formatDate(a.data_hora_inicio)} · {one(a.services)?.nome ?? 'Serviço'}
                      </span>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          a.status === 'concluido'
                            ? 'text-success'
                            : a.status === 'cancelado'
                              ? 'text-danger'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <Receipt size={13} />
                Compras recentes
              </h3>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
              ) : (
                <div className="space-y-1.5">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-sm bg-surface-2 rounded px-3 py-2">
                      <span className="text-foreground">{o.closed_at ? formatDate(o.closed_at) : '—'}</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(
                          o.order_items.reduce((a, i) => a + i.quantidade * Number(i.preco_unitario), 0),
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
