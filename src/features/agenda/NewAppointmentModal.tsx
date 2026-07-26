import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Professional, Service } from './types'

type Props = {
  salonId: string
  date: Date
  professionals: Professional[]
  services: Service[]
  defaultProfessionalId?: string
  defaultTime?: string
  onClose: () => void
  onCreated: () => void
}

function toDateTimeLocal(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function NewAppointmentModal({
  salonId,
  date,
  professionals,
  services,
  defaultProfessionalId,
  defaultTime,
  onClose,
  onCreated,
}: Props) {
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? '')
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [time, setTime] = useState(defaultTime ?? '09:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!clientName.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    if (!professionalId || !serviceId) {
      setError('Selecione profissional e serviço.')
      return
    }

    const service = services.find((s) => s.id === serviceId)
    if (!service) {
      setError('Serviço inválido.')
      return
    }

    setSubmitting(true)
    try {
      let clientId: string

      const { data: existingClient, error: findError } = await supabase
        .from('clients')
        .select('id')
        .eq('salon_id', salonId)
        .ilike('nome', clientName.trim())
        .maybeSingle()

      if (findError) throw findError

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const { data: newClient, error: createError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, nome: clientName.trim(), telefone: clientPhone.trim() || null })
          .select('id')
          .single()
        if (createError) throw createError
        clientId = newClient.id
      }

      const start = toDateTimeLocal(date, time)
      const end = new Date(start.getTime() + service.duracao_minutos * 60000)

      const { error: apptError } = await supabase.from('appointments').insert({
        salon_id: salonId,
        client_id: clientId,
        professional_id: professionalId,
        service_id: serviceId,
        data_hora_inicio: start.toISOString(),
        data_hora_fim: end.toISOString(),
        status: 'agendado',
      })
      if (apptError) throw apptError

      onCreated()
      onClose()
    } catch (err) {
      console.error('Erro ao criar reserva:', err)
      const code = (err as { code?: string } | null)?.code
      setError(
        code === '23P01'
          ? 'Já existe um agendamento nesse horário para este profissional. Escolha outro horário.'
          : 'Não foi possível criar a reserva. Tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-surface rounded-xl border border-border-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Nova reserva</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="clientName">Cliente</label>
            <input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Nome do cliente"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="clientPhone">Telefone (opcional)</label>
            <input
              id="clientPhone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="(11) 90000-0000"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="professional">Profissional</label>
            <select
              id="professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="service">Serviço</label>
            <select
              id="service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {s.duracao_minutos}min · R$ {s.preco.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="time">Horário</label>
            <input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || professionals.length === 0 || services.length === 0}
              className="flex-1 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
