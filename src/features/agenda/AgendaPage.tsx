import { useMemo, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useAgendaData } from './useAgendaData'
import { MiniCalendar } from './MiniCalendar'
import { NewAppointmentModal } from './NewAppointmentModal'
import type { Appointment } from './types'

const HOUR_START = 6
const HOUR_END = 22
const ROW_HEIGHT = 60
const SNAP_MINUTES = 15

const WEEKDAY_FULL = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function minutesSinceStart(iso: string) {
  const d = new Date(iso)
  return (d.getHours() - HOUR_START) * 60 + d.getMinutes()
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function AppointmentBlock({
  appt,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  appt: Appointment
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const top = (minutesSinceStart(appt.data_hora_inicio) / 60) * ROW_HEIGHT
  const durationMin =
    (new Date(appt.data_hora_fim).getTime() - new Date(appt.data_hora_inicio).getTime()) / 60000
  const height = Math.max((durationMin / 60) * ROW_HEIGHT, 24)

  return (
    <div
      draggable
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('text/plain', appt.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`absolute inset-x-1 rounded-lg bg-primary-soft border-l-2 border-primary px-2 py-1 overflow-hidden cursor-grab active:cursor-grabbing select-none ${
        dragging ? 'opacity-40' : ''
      }`}
      style={{ top, height }}
    >
      <div className="text-xs font-medium text-primary-soft-foreground truncate">
        {formatTime(appt.data_hora_inicio)} · {appt.client_nome ?? 'Cliente'}
      </div>
      {appt.service_nome && <div className="text-[11px] text-primary-soft-foreground/70 truncate">{appt.service_nome}</div>}
    </div>
  )
}

export function AgendaPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [visibleMonth, setVisibleMonth] = useState(new Date())
  const { professionals, services, appointments, loading, error, reload } = useAgendaData(salonId, selectedDate)

  const [modalState, setModalState] = useState<{ professionalId?: string; time?: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i),
    [],
  )
  const gridHeight = (HOUR_END - HOUR_START) * ROW_HEIGHT

  function appointmentsFor(professionalId: string) {
    return appointments.filter((a) => a.professional_id === professionalId)
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setVisibleMonth(date)
  }

  function handleSlotClick(professionalId: string, hour: number) {
    setModalState({ professionalId, time: `${String(hour).padStart(2, '0')}:00` })
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, professionalId: string) {
    e.preventDefault()
    const apptId = e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    if (!apptId) return

    const appt = appointments.find((a) => a.id === apptId)
    if (!appt) return

    const rect = e.currentTarget.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const totalGridMinutes = (HOUR_END - HOUR_START) * 60
    const rawMinutes = (offsetY / gridHeight) * totalGridMinutes
    const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES
    const clamped = Math.min(Math.max(snapped, 0), totalGridMinutes)

    const durationMs = new Date(appt.data_hora_fim).getTime() - new Date(appt.data_hora_inicio).getTime()
    const newStart = new Date(selectedDate)
    newStart.setHours(HOUR_START, 0, 0, 0)
    newStart.setMinutes(newStart.getMinutes() + clamped)
    const newEnd = new Date(newStart.getTime() + durationMs)

    setRescheduling(true)
    setRescheduleError(null)
    try {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          professional_id: professionalId,
          data_hora_inicio: newStart.toISOString(),
          data_hora_fim: newEnd.toISOString(),
        })
        .eq('id', apptId)
      if (updateError) throw updateError
      await reload()
    } catch (err) {
      console.error('Erro ao reagendar:', err)
      setRescheduleError('Não foi possível reagendar. Verifique sua conexão e tente novamente.')
    } finally {
      setRescheduling(false)
    }
  }

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
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSelectDate(addDays(selectedDate, -1))}
              className="p-2 border border-border-strong rounded hover:bg-surface-2 text-foreground"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {selectedDate.getDate()} de {MONTH_SHORT[selectedDate.getMonth()]}
              </div>
              <div className="text-xs text-muted-foreground capitalize">{WEEKDAY_FULL[selectedDate.getDay()]}</div>
            </div>
            <button
              onClick={() => handleSelectDate(addDays(selectedDate, 1))}
              className="p-2 border border-border-strong rounded hover:bg-surface-2 text-foreground"
              aria-label="Próximo dia"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={() => setModalState({})}
            className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Nova reserva
          </button>
        </div>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        {!loading && professionals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum profissional cadastrado ainda. Cadastre um profissional para começar a usar a agenda.
          </p>
        ) : (
          <div
            className="bg-surface rounded-xl border border-border overflow-auto"
            style={{ maxHeight: 'calc(100vh - 260px)' }}
          >
            {/* Header com nomes dos profissionais */}
            <div className="flex border-b border-border sticky top-0 bg-surface z-10 min-w-fit">
              <div className="w-14 shrink-0" />
              {professionals.map((p) => (
                <div key={p.id} className="flex-1 min-w-[160px] px-3 py-2 text-sm font-medium text-foreground border-l border-border">
                  {p.nome}
                </div>
              ))}
            </div>

            {/* Grade */}
            <div className="flex min-w-fit pt-3 pb-3">
              <div className="w-14 shrink-0 relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
                    style={{ top: (h - HOUR_START) * ROW_HEIGHT }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {professionals.map((p) => (
                <div
                  key={p.id}
                  className="flex-1 min-w-[160px] relative border-l border-border"
                  style={{ height: gridHeight }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, p.id)}
                >
                  {hours.slice(0, -1).map((h) => (
                    <button
                      key={h}
                      onClick={() => handleSlotClick(p.id, h)}
                      className="absolute inset-x-0 border-t border-border hover:bg-surface-2 text-left"
                      style={{ top: (h - HOUR_START) * ROW_HEIGHT, height: ROW_HEIGHT }}
                      aria-label={`Adicionar horário às ${h}:00 com ${p.nome}`}
                    />
                  ))}

                  {appointmentsFor(p.id).map((appt) => (
                    <AppointmentBlock
                      key={appt.id}
                      appt={appt}
                      dragging={draggingId === appt.id}
                      onDragStart={() => setDraggingId(appt.id)}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {rescheduling && <p className="text-xs text-muted-foreground mt-2">Reagendando...</p>}
        {rescheduleError && (
          <p className="text-xs text-danger mt-2 flex items-center gap-2">
            {rescheduleError}
            <button onClick={() => setRescheduleError(null)} className="underline">
              fechar
            </button>
          </p>
        )}
      </div>

      <div className="w-full lg:w-72 shrink-0 space-y-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="text-sm text-muted-foreground">Reservas</div>
          <div className="text-2xl font-semibold text-foreground">{appointments.length}</div>
          <div className="text-xs text-muted-foreground">
            {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <MiniCalendar
          selectedDate={selectedDate}
          visibleMonth={visibleMonth}
          onSelectDate={handleSelectDate}
          onChangeMonth={setVisibleMonth}
        />
      </div>

      {modalState && (
        <NewAppointmentModal
          salonId={salonId}
          date={selectedDate}
          professionals={professionals}
          services={services}
          defaultProfessionalId={modalState.professionalId}
          defaultTime={modalState.time}
          onClose={() => setModalState(null)}
          onCreated={reload}
        />
      )}
    </div>
  )
}
