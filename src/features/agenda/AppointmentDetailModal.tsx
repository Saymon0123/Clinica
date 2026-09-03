import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Trash2, XCircle, Receipt } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Input, Select } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { useSalon } from '../auth/useSalon'
import { toast } from '../../components/Toast'
import type { Appointment } from './types'
import { ErroInline } from '../../components/ErroInline'

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  bloqueio: 'Bloqueio',
  faltou: 'Não veio',
}

const STATUS_STYLES: Record<string, string> = {
  agendado: 'bg-primary-soft text-primary-soft-foreground',
  confirmado: 'bg-success-soft text-success',
  concluido: 'bg-success-soft text-success',
  cancelado: 'bg-danger-soft text-danger',
  bloqueio: 'bg-surface-2 text-muted-foreground',
  faltou: 'bg-warning-soft text-warning',
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

function toDateInput(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeInput(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type ServicoDoAgendamento = {
  service_id: string
  nome: string
  preco: number
  duracao_minutos: number
}

function formatDuracao(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
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
  const [confirmCancel, setConfirmCancel] = useState(false)

  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(() => toDateInput(appointment.data_hora_inicio))
  const [timeValue, setTimeValue] = useState(() => toTimeInput(appointment.data_hora_inicio))
  // Trocar o barbeiro por aqui (achado 29 da revisão de 01/09): arrastar o
  // bloco entre colunas não funciona no toque, e no celular esse era o ÚNICO
  // caminho — remarcar de barbeiro exigia cancelar e criar de novo.
  const [professionalValue, setProfessionalValue] = useState(appointment.professional_id)
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([])

  // Corte + barba num agendamento só (item 6): a lista completa vem da view
  // `servicos_do_agendamento`. Com 1 item só, cai de volta no rótulo simples
  // que já existia (service_nome).
  const [servicos, setServicos] = useState<ServicoDoAgendamento[] | null>(null)
  const { salonId } = useSalon()

  useEffect(() => {
    let cancelado = false
    supabase
      .from('servicos_do_agendamento')
      .select('service_id, nome, preco, duracao_minutos')
      .eq('appointment_id', appointment.id)
      .order('ordem')
      .then(({ data, error: fetchError }) => {
        if (cancelado) return
        if (fetchError) {
          console.error('Erro ao buscar serviços do agendamento:', fetchError)
          return
        }
        setServicos((data ?? []) as ServicoDoAgendamento[])
      })
    return () => {
      cancelado = true
    }
  }, [appointment.id])

  // Só quando a pessoa abre "Alterar data/horário": a lista serve ao seletor
  // de barbeiro e não precisa carregar para quem só veio ler o detalhe.
  useEffect(() => {
    if (!editingDate || !salonId) return
    let cancelado = false
    supabase
      .from('professionals')
      .select('id, nome')
      .eq('salon_id', salonId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error: fetchError }) => {
        if (cancelado) return
        if (fetchError) {
          console.error('Erro ao buscar os barbeiros:', fetchError)
          return
        }
        setProfissionais((data ?? []) as { id: string; nome: string }[])
      })
    return () => {
      cancelado = true
    }
  }, [editingDate, salonId])

  const duracaoTotalMin =
    servicos && servicos.length > 0
      ? servicos.reduce((acc, s) => acc + s.duracao_minutos, 0)
      : Math.round(
          (new Date(appointment.data_hora_fim).getTime() - new Date(appointment.data_hora_inicio).getTime()) / 60000,
        )
  const precoTotal = servicos?.reduce((acc, s) => acc + s.preco, 0) ?? 0

  async function handleReschedule() {
    if (!dateValue || !timeValue) {
      setError('Informe a nova data e o novo horário.')
      return
    }

    const [year, month, day] = dateValue.split('-').map(Number)
    const [hour, minute] = timeValue.split(':').map(Number)
    const newStart = new Date(year, month - 1, day, hour, minute, 0, 0)
    if (Number.isNaN(newStart.getTime())) {
      setError('Data ou horário inválido.')
      return
    }

    // Mantém a mesma duração do agendamento original.
    const durationMs =
      new Date(appointment.data_hora_fim).getTime() - new Date(appointment.data_hora_inicio).getTime()
    const newEnd = new Date(newStart.getTime() + durationMs)

    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        professional_id: professionalValue,
        data_hora_inicio: newStart.toISOString(),
        data_hora_fim: newEnd.toISOString(),
      })
      .eq('id', appointment.id)
    setBusy(false)

    if (updateError) {
      console.error('Erro ao reagendar:', updateError)
      // 23P01 pode ser choque OU folga (trigger da 0134). A frase do banco,
      // em português, diz qual; o tradutor a mostra como veio e só cai na
      // frase fixa quando não há uma melhor.
      setError(
        traduzirErroDoBanco(
          updateError,
          { '23P01': 'Já existe um agendamento nesse horário para este profissional. Escolha outro horário.' },
          'Não foi possível alterar a data. Tente novamente.',
        ),
      )
      return
    }
    onChanged()
    onClose()
  }

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
    if (status === 'cancelado') toast('Agendamento cancelado — o horário voltou a ficar livre')
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
    if (servicos && servicos.length > 1) {
      params.set('serviceIds', servicos.map((s) => s.service_id).join(','))
    }
    // Nome e hora viajam junto para a faixa de "cobrança pendente" dizer DE
    // QUEM é o atendimento sem precisar consultar o banco de novo.
    if (appointment.client_nome) params.set('clienteNome', appointment.client_nome)
    params.set(
      'horaLocal',
      new Date(appointment.data_hora_inicio).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
    navigate(`/financeiro?${params.toString()}`)
  }

  // `faltou` entra aqui junto com os outros dois: oferecer "Concluir" em quem
  // não apareceu produz atendimento fantasma no financeiro.
  const isFinal =
    appointment.status === 'concluido' ||
    appointment.status === 'cancelado' ||
    appointment.status === 'faltou'

  return (
    <Modal onClose={onClose} titulo="Agendamento" tamanho="sm">
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
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground shrink-0">Serviço</span>
            <span className="text-sm font-medium text-foreground text-right">
              {servicos && servicos.length > 1
                ? `${servicos.map((s) => s.nome).join(' + ')} · ${formatDuracao(duracaoTotalMin)} · R$ ${precoTotal.toFixed(2)}`
                : appointment.service_nome ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Início</span>
            <span className="text-sm font-medium text-foreground">{formatDateTime(appointment.data_hora_inicio)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fim</span>
            <span className="text-sm font-medium text-foreground">{formatDateTime(appointment.data_hora_fim)}</span>
          </div>

          {!isFinal &&
            (editingDate ? (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Nova data e horário</span>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="date"
                      value={dateValue}
                      onChange={(e) => setDateValue(e.target.value)}
                      aria-label="Nova data"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="time"
                      value={timeValue}
                      onChange={(e) => setTimeValue(e.target.value)}
                      step={300}
                      aria-label="Novo horário"
                    />
                  </div>
                </div>
                {profissionais.length > 1 && (
                  <Select
                    value={professionalValue}
                    onChange={(e) => setProfessionalValue(e.target.value)}
                    aria-label="Barbeiro"
                  >
                    {profissionais.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  A duração do serviço é mantida automaticamente.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingDate(false)
                      setDateValue(toDateInput(appointment.data_hora_inicio))
                      setTimeValue(toTimeInput(appointment.data_hora_inicio))
                      setProfessionalValue(appointment.professional_id)
                      setError(null)
                    }}
                    className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleReschedule}
                    disabled={busy}
                    className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {busy ? 'Salvando...' : 'Salvar nova data'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingDate(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline pt-1"
              >
                <CalendarClock size={14} />
                Alterar data/horário
              </button>
            ))}
        </div>

        <div className="mb-3"><ErroInline>{error}</ErroInline></div>

        {!isFinal && (
          <div className="space-y-2">
            <button
              onClick={handleConcludeAndCharge}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Receipt size={16} />
              Concluir e cobrar
            </button>
            {/* Confirmação inline, como no excluir: cancelar por engano era o
                toque errado mais provável do modal — e ele libera o horário
                para o agente vender na hora. */}
            {confirmCancel ? (
              <div className="flex items-center justify-between gap-2 border border-border-strong rounded-lg px-3 py-2">
                <span className="text-xs text-danger">
                  Cancelar? O horário volta a ficar disponível.
                </span>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => updateStatus('cancelado')}
                    disabled={busy}
                    className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                  >
                    Sim, cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
                className="w-full flex items-center justify-center gap-1.5 border border-border-strong rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                <XCircle size={16} />
                Cancelar agendamento
              </button>
            )}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          {/* Agendamento concluído já virou COMANDA. Excluir aqui não apaga a
              venda: a FK é ON DELETE SET NULL, então a comanda fica órfã, o
              atendimento some do histórico do cliente e a comissão perde a
              origem — e o próprio barbeiro conseguia fazer isso (achado 13). */}
          {appointment.status === 'concluido' ? (
            <p className="text-xs text-muted-foreground">
              Este atendimento já foi concluído e pode ter comanda ligada a ele, por isso não é
              possível excluí-lo. Para corrigir valores, ajuste a venda no Financeiro.
            </p>
          ) : confirmDelete ? (
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
              <Trash2 size={14} />
              Excluir agendamento
            </button>
          )}
        </div>
    </Modal>
  )
}
