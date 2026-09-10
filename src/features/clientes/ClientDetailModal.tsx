import { useEffect, useState } from 'react'
import { BellOff, CalendarCheck, Pencil, Receipt, X } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { EstadoVazio } from '../../components/EstadoVazio'
import { Badge } from '../../components/Badge'
import { supabase } from '../../lib/supabase'
import { formatarTelefone, linkWhatsApp } from '../../lib/telefone'
import type { Client } from './types'

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

import { PacotesDoCliente } from './PacotesDoCliente'
import { ErroInline } from '../../components/ErroInline'

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  // O histórico do cliente é justamente onde a diferença entre "remarcou" e
  // "sumiu três vezes" importa — e é o que a política de atraso vai olhar.
  faltou: 'Não veio',
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
  aoMudarContato,
}: {
  client: Client
  onClose: () => void
  onEdit: () => void
  /** Avisa a lista para recarregar quando o opt-out muda. */
  aoMudarContato?: () => void
}) {
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([])
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [recusou, setRecusou] = useState(client.recusou_contato)
  const [salvandoContato, setSalvandoContato] = useState(false)
  const [erroContato, setErroContato] = useState<string | null>(null)

  /**
   * O opt-out também pela mão do dono.
   *
   * O cliente costuma pedir "para de me mandar isso" na cadeira, não pelo
   * botão do WhatsApp. Sem esta chave, esse pedido não tinha onde ser
   * registrado — e a reativação continuava saindo. Também é o único jeito de
   * DESFAZER quando a pessoa muda de ideia.
   */
  async function alternarContato() {
    const novo = !recusou
    setSalvandoContato(true)
    setErroContato(null)
    const { error } = await supabase
      .from('clients')
      .update({ recusou_contato: novo })
      .eq('id', client.id)
    setSalvandoContato(false)
    if (error) {
      console.error('Erro ao mudar a preferência de contato:', error)
      setErroContato('Não foi possível salvar. Tente de novo.')
      return
    }
    setRecusou(novo)
    aoMudarContato?.()
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Os totais vêm de consultas SEM limite — somar em cima da lista de
      // "recentes" (15 linhas) mentia justamente para o cliente fiel, que tem
      // mais histórico do que cabe na lista.
      const [appts, ords, concluidos] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, data_hora_inicio, status, services!appointments_service_id_fkey(nome)')
          .eq('client_id', client.id)
          .order('data_hora_inicio', { ascending: false })
          .limit(15),
        supabase
          .from('orders')
          .select('id, closed_at, order_items(quantidade, preco_unitario)')
          .eq('client_id', client.id)
          .eq('status', 'fechada')
          .order('closed_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', client.id)
          .eq('status', 'concluido'),
      ])
      if (appts.error || ords.error || concluidos.error) {
        console.error('Erro ao carregar o histórico do cliente:', appts.error ?? ords.error ?? concluidos.error)
        setErro(true)
        setLoading(false)
        return
      }
      setErro(false)
      const todasCompras = (ords.data ?? []) as unknown as HistoryOrder[]
      setAppointments((appts.data ?? []) as unknown as HistoryAppointment[])
      setOrders(todasCompras.slice(0, 15))
      setTotalSpent(
        todasCompras.reduce(
          (acc, o) =>
            acc + o.order_items.reduce((a, i) => a + i.quantidade * Number(i.preco_unitario), 0),
          0,
        ),
      )
      setCompletedCount(concluidos.count ?? 0)
      setLoading(false)
    }
    load()
  }, [client.id])

  return (
    <Modal onClose={onClose} tamanho="md">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">{client.nome}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              aria-label="Editar cliente"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-surface-2"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {client.telefone ? (
            linkWhatsApp(client.telefone) ? (
              <a
                href={linkWhatsApp(client.telefone)!}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversa no WhatsApp"
                className="text-primary hover:underline"
              >
                {formatarTelefone(client.telefone)}
              </a>
            ) : (
              formatarTelefone(client.telefone)
            )
          ) : (
            'Sem telefone'
          )}
        </p>

        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <BellOff size={15} className={recusou ? 'text-warning' : 'text-muted-foreground'} />
                {recusou ? 'Não quer receber convites' : 'Aceita receber convites'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {recusou
                  ? 'Não entra em reativação nem em campanha. O lembrete do horário que ele marcar continua chegando.'
                  : 'Pode entrar em reativação e campanha. Se pedir para parar, desligue aqui.'}
              </p>
            </div>
            <button
              type="button"
              onClick={alternarContato}
              disabled={salvandoContato}
              className="btn-chip shrink-0 disabled:opacity-50"
            >
              {salvandoContato ? 'Salvando...' : recusou ? 'Voltar a enviar' : 'Não enviar mais'}
            </button>
          </div>
          <ErroInline>{erroContato}</ErroInline>
        </div>

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

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando histórico...</p>
        ) : erro ? (
          <div className="py-4">
            <ErroInline>
              Não foi possível carregar o histórico. Feche e abra a ficha de novo.
            </ErroInline>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <CalendarCheck size={14} />
                Agendamentos recentes
              </h3>
              {appointments.length === 0 ? (
                <EstadoVazio icone={CalendarCheck} titulo="Nenhum agendamento ainda." />
              ) : (
                <div className="space-y-1.5">
                  {appointments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm bg-surface-2 rounded-lg px-3 py-2">
                      <span className="text-foreground truncate">
                        {formatDate(a.data_hora_inicio)} · {one(a.services)?.nome ?? 'Serviço'}
                      </span>
                      <span className="shrink-0">
                        <Badge
                          variante={
                            a.status === 'concluido'
                              ? 'ok'
                              : a.status === 'cancelado' || a.status === 'faltou'
                                ? 'perigo'
                                : 'atencao'
                          }
                        >
                          {STATUS_LABELS[a.status] ?? a.status}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Antes das compras: é o que o barbeiro abre a ficha para ver
                quando o cliente pergunta "quantos cortes ainda tenho?". */}
            <PacotesDoCliente clientId={client.id} />

            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <Receipt size={14} />
                Compras recentes
              </h3>
              {orders.length === 0 ? (
                <EstadoVazio icone={Receipt} titulo="Nenhuma compra registrada." />
              ) : (
                <div className="space-y-1.5">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-sm bg-surface-2 rounded-lg px-3 py-2">
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
    </Modal>
  )
}
