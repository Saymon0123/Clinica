import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Trash2, X, XCircle, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Appointment } from './types'

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  bloqueio: 'Bloqueio',
}

const STATUS_STYLES: Record<string, string> = {
  agendado: 'bg-primary-soft text-primary-soft-foreground',
  confirmado: 'bg-success-soft text-success',
  concluido: 'bg-success-soft text-success',
  cancelado: 'bg-danger-soft text-danger',
  bloqueio: 'bg-surface-2 text-muted-foreground',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AppointmentDetailModal({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: Appointment
  onClose: () => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function updateStatus(status: 'confirmado' | 'concluido' | 'cancelado') {
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appointment.id)
    setBusy(false)
    if (updateError) {
      console.error('Erro ao atualizar agendamento:', updateError)
      setError('Não foi possível atualizar o agendamento. Tente novamente.')
      return
    }
    onChanged()
    onClose()
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    const { error: deleteError } = await supabase.from('appointments').delete().eq('id', appointment.id)
    setBusy(false)
    if (deleteError) {
      console.error('Erro ao excluir agendamento:', deleteError)
      setError('Não foi possível excluir o agendamento. Tente novamente.')
      return
    }
    onChanged()
    onClose()
  }

  function handleConcludeAndCharge() {
    const params = new URLSearchParams({ appointmentId: appointment.id })
    if (appointment.client_id) params.set('clientId', appointment.client_id)
    if (appointment.professional_id) params.set('professionalId', appointment.professional_id)
    if (appointment.service_id) params.set('serviceId', appointment.service_id)
    navigate(`/vendas?${params.toString()}`)
  }

  const isFinal = appointment.status === 'concluido' || appointment.status === 'cancelado'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Agendamento</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span
              className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                STATUS_STYLES[appointment.status] ?? 'bg-surface-2 text-muted-foreground'
              }`}
            >
              {STATUS_LABELS[appointment.status] ?? appointment.status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cliente</span>
            <span className="text-sm font-medium text-foreground">{appointment.client_nome ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Serviço</span>
            <span className="text-sm font-medium text-foreground">{appointment.service_nome ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Início</span>
            <span className="text-sm font-medium text-foreground">{formatDateTime(appointment.data_hora_inicio)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fim</span>
            <span className="text-sm font-medium text-foreground">{formatDateTime(appointment.data_hora_fim)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        {!isFinal && (
          <div className="space-y-2">
            <button
              onClick={handleConcludeAndCharge}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Receipt size={15} />
              Concluir e cobrar
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateStatus('concluido')}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 border border-border-strong rounded px-3 py-2 text-sm font-medium text-success hover:bg-success-soft disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Só concluir
              </button>
              <button
                onClick={() => updateStatus('cancelado')}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 border border-border-strong rounded px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                <XCircle size={15} />
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          {confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-danger">Excluir de vez? Não dá para desfazer.</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Voltar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="text-xs font-medium text-danger disabled:opacity-50"
                >
                  Sim, excluir
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-danger"
            >
              <Trash2 size={13} />
              Excluir agendamento
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
