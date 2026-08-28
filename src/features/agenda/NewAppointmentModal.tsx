import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Campo, Input, Select } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import type { Professional, Service } from './types'
import { ErroInline } from '../../components/ErroInline'

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
    // Só o cliente criado NESTA tentativa pode ser desfeito. Um cliente que já
    // existia continua existindo, mesmo que a reserva falhe.
    let clienteCriadoAgora: string | null = null
    try {
      let clientId: string

      // A identidade real é o TELEFONE (o banco deduplica pelos últimos 8
      // dígitos): com telefone digitado, o casamento é por ele — dois "João
      // Silva" diferentes deixam de virar a mesma pessoa. Nome é o último
      // recurso, só quando não há telefone.
      const digitos = clientPhone.replace(/\D/g, '')
      let existingClient: { id: string } | null = null

      if (digitos.length >= 8) {
        const { data, error: phoneError } = await supabase
          .from('clients')
          .select('id')
          .eq('salon_id', salonId)
          .eq('telefone_norm', digitos.slice(-8))
          .limit(1)
        if (phoneError) throw phoneError
        existingClient = data?.[0] ?? null
      }

      if (!existingClient && digitos.length < 8) {
        // limit(1) em vez de maybeSingle: dois clientes com o mesmo nome no
        // salão fariam o maybeSingle estourar sem explicação.
        const { data, error: findError } = await supabase
          .from('clients')
          .select('id')
          .eq('salon_id', salonId)
          .ilike('nome', clientName.trim())
          .limit(1)
        if (findError) throw findError
        existingClient = data?.[0] ?? null
      }

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
        clienteCriadoAgora = newClient.id
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

      clienteCriadoAgora = null
      onCreated()
      onClose()
    } catch (err) {
      // Sem transação entre os dois inserts, a reserva recusada (horário
      // ocupado, por exemplo) deixaria para trás um cliente sem nenhum
      // agendamento. Cada nova tentativa sujaria a aba Clientes.
      if (clienteCriadoAgora) {
        const { error: limpezaError } = await supabase
          .from('clients')
          .delete()
          .eq('id', clienteCriadoAgora)
        if (limpezaError) {
          console.error('Cliente criado sem reserva e não foi possível removê-lo:', limpezaError)
        }
      }
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
    <Modal onClose={onClose} titulo="Nova reserva" tamanho="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo rotulo="Cliente" htmlFor="clientName">
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              placeholder="Nome do cliente"
            />
          </Campo>

          <Campo rotulo="Telefone (opcional)" htmlFor="clientPhone">
            <Input
              id="clientPhone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </Campo>

          <Campo rotulo="Profissional" htmlFor="professional">
            <Select
              id="professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              required
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </Campo>

          <Campo rotulo="Serviço" htmlFor="service">
            <Select
              id="service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {s.duracao_minutos}min · R$ {s.preco.toFixed(2)}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo rotulo="Horário" htmlFor="time">
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </Campo>

          <ErroInline>{error}</ErroInline>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || professionals.length === 0 || services.length === 0}
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar reserva'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
