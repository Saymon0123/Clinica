import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useAgendaData } from './useAgendaData'
import { MiniCalendar } from './MiniCalendar'
import { NewAppointmentModal } from './NewAppointmentModal'
import { AppointmentDetailModal } from './AppointmentDetailModal'
import type { Appointment } from './types'
import { CardAtivacao } from '../ativacao/CardAtivacao'
import { PageHeader } from '../../components/PageHeader'
import { SkeletonPagina } from '../../components/Skeleton'
import { EstadoVazio } from '../../components/EstadoVazio'
import { ErroInline } from '../../components/ErroInline'

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

const BLOCK_STYLES: Record<string, { container: string; text: string; subtext: string }> = {
  default: {
    container: 'bg-primary-soft border-primary',
    text: 'text-primary-soft-foreground',
    subtext: 'text-primary-soft-foreground/70',
  },
  concluido: {
    container: 'bg-success-soft border-success',
    text: 'text-success',
    subtext: 'text-success/70',
  },
  cancelado: {
    container: 'bg-surface-2 border-border-strong opacity-60',
    text: 'text-muted-foreground line-through',
    subtext: 'text-muted-foreground/70',
  },
  // Mesmo tratamento do cancelado, e pelo mesmo motivo: as travas de
  // sobreposição e o `horarios_livres` ignoram os dois, então o horário está
  // livre de verdade. Sem isto o bloco continuaria azul, dando a entender que
  // segue ocupado logo depois de o barbeiro liberar a cadeira.
  faltou: {
    container: 'bg-surface-2 border-border-strong opacity-60',
    text: 'text-muted-foreground line-through',
    subtext: 'text-muted-foreground/70',
  },
}

function AppointmentBlock({
  appt,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  appt: Appointment
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const top = (minutesSinceStart(appt.data_hora_inicio) / 60) * ROW_HEIGHT
  const durationMin =
    (new Date(appt.data_hora_fim).getTime() - new Date(appt.data_hora_inicio).getTime()) / 60000
  const height = Math.max((durationMin / 60) * ROW_HEIGHT, 24)
  const style = BLOCK_STYLES[appt.status] ?? BLOCK_STYLES.default
  // Cancelado e faltou liberam o horário, então um agendamento novo pode nascer
  // por cima. O finalizado fica ATRÁS (zIndex menor) para o ativo continuar
  // clicável — e não arrasta: mover um cancelamento não significa nada.
  const finalizado = appt.status === 'cancelado' || appt.status === 'faltou' || appt.status === 'concluido'

  return (
    <div
      draggable={!finalizado}
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        if (finalizado) return
        e.dataTransfer.setData('text/plain', appt.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`absolute inset-x-1 rounded-lg border-l-2 px-2 py-1 overflow-hidden cursor-pointer select-none ${style.container} ${
        dragging ? 'opacity-40' : ''
      }`}
      style={{ top, height, zIndex: finalizado ? 1 : 2 }}
    >
      <div className={`text-xs font-medium truncate ${style.text}`}>
        {formatTime(appt.data_hora_inicio)} · {appt.client_nome ?? 'Cliente'}
      </div>
      {appt.service_nome && <div className={`text-[11px] truncate ${style.subtext}`}>{appt.service_nome}</div>}
    </div>
  )
}

/**
 * Traço da hora atual, só quando o dia exibido é hoje. Puramente visual:
 * responde "onde estamos no dia" sem a pessoa ler a régua de horas.
 * Reposiciona a cada minuto — mesma granularidade da régua.
 */
function LinhaDeAgora({ selectedDate }: { selectedDate: Date }) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const hoje =
    agora.getFullYear() === selectedDate.getFullYear() &&
    agora.getMonth() === selectedDate.getMonth() &&
    agora.getDate() === selectedDate.getDate()
  const minutos = (agora.getHours() - HOUR_START) * 60 + agora.getMinutes()
  if (!hoje || minutos < 0 || minutos > (HOUR_END - HOUR_START) * 60) return null

  return (
    <div
      aria-hidden
      className="absolute inset-x-0 z-[3] pointer-events-none flex items-center"
      // 12px = pt-3 do contêiner da grade, para casar com a régua de horas.
      style={{ top: 12 + (minutos / 60) * ROW_HEIGHT }}
    >
      <span className="w-14 shrink-0 flex justify-end pr-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
      </span>
      <span className="flex-1 h-px bg-danger/50" />
    </div>
  )
}

export function AgendaPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [visibleMonth, setVisibleMonth] = useState(new Date())
  const { professionals, services, appointments, jornadas, loading, error, reload } = useAgendaData(salonId, selectedDate)

  const [modalState, setModalState] = useState<{ professionalId?: string; time?: string } | null>(null)
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i),
    [],
  )
  const gridHeight = (HOUR_END - HOUR_START) * ROW_HEIGHT

  // Abre a grade já rolada perto da hora atual quando o dia exibido é hoje.
  // Antes ela abria sempre às 06:00 — de tarde, meio dia de vazio até o que
  // interessa. Só no primeiro carregamento de cada dia, para não roubar o
  // scroll de quem já está navegando.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (loading || !scrollRef.current) return
    const agora = new Date()
    const ehHoje =
      agora.getFullYear() === selectedDate.getFullYear() &&
      agora.getMonth() === selectedDate.getMonth() &&
      agora.getDate() === selectedDate.getDate()
    if (!ehHoje) return
    const minutos = (agora.getHours() - HOUR_START) * 60 + agora.getMinutes()
    // 90 min de contexto acima da linha de agora.
    const alvo = Math.max(0, ((minutos - 90) / 60) * ROW_HEIGHT)
    scrollRef.current.scrollTop = alvo
    // selectedDate na dependência: trocar de dia e voltar re-ancora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedDate])

  /**
   * Sombras de fora-da-jornada da coluna: pares [topo, altura] em px.
   * Sem registro para o dia = grade neutra (jornada nunca configurada);
   * registro inativo = folga, coluna inteira sombreada. Só visual — o clique
   * continua livre, encaixe fora do expediente sempre foi permitido.
   */
  function sombrasDaColuna(professionalId: string): [number, number][] {
    if (!(professionalId in jornadas)) return []
    const j = jornadas[professionalId]
    if (j === null) return [[0, gridHeight]]
    const paraPx = (min: number) =>
      Math.min(Math.max(((min - HOUR_START * 60) / 60) * ROW_HEIGHT, 0), gridHeight)
    const inicio = paraPx(j.inicioMin)
    const fim = paraPx(j.fimMin)
    const sombras: [number, number][] = []
    if (inicio > 0) sombras.push([0, inicio])
    if (fim < gridHeight) sombras.push([fim, gridHeight - fim])
    return sombras
  }

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
      const code = (err as { code?: string } | null)?.code
      setRescheduleError(
        code === '23P01'
          ? 'Já existe um agendamento nesse horário para este profissional. Escolha outro horário.'
          : 'Não foi possível reagendar. Verifique sua conexão e tente novamente.',
      )
    } finally {
      setRescheduling(false)
    }
  }

  if (salonLoading) {
    return <SkeletonPagina />
  }

  if (!salonId) {
    return (
      <EstadoVazio
        icone={Building2}
        titulo="Conta sem barbearia vinculada"
        descricao="Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema."
      />
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <PageHeader titulo="Agenda" subtitulo="As reservas do dia, por profissional" />
        <CardAtivacao />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {/* Stepper segmentado: os dois chevrons e a data numa peça só, em vez
              de dois botões quadrados órfãos flutuando em volta do texto. */}
          <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
            <button
              onClick={() => handleSelectDate(addDays(selectedDate, -1))}
              className="p-2 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-1 text-center border-x border-border min-w-[7.5rem]">
              <div className="text-sm font-semibold text-foreground tabular-nums">
                {selectedDate.getDate()} de {MONTH_SHORT[selectedDate.getMonth()]}
              </div>
              <div className="text-[11px] text-muted-foreground capitalize leading-tight">
                {WEEKDAY_FULL[selectedDate.getDay()]}
              </div>
            </div>
            <button
              onClick={() => handleSelectDate(addDays(selectedDate, 1))}
              className="p-2 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Próximo dia"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={() => setModalState({})}
            className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Nova reserva
          </button>
        </div>

        {/* A faixa do balcão (chegou/não veio) saiu em 2026-08-25: a decisão
            de presença deixou de ser do barbeiro. Quem fecha o ciclo é o
            banco — 15 min após o fim previsto do serviço, sem comanda fechada,
            o agendamento cancela sozinho (cancela_agendamentos_sem_comanda). */}
        <div className="mb-3"><ErroInline>{error}</ErroInline></div>

        {!loading && professionals.length === 0 ? (
          <EstadoVazio
            icone={Users}
            titulo="Nenhum profissional cadastrado ainda"
            descricao="Cadastre um profissional para começar a usar a agenda."
            acao={
              <Link to="/equipe" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium inline-block">
                Ir para Equipe
              </Link>
            }
          />
        ) : (
          <div
            ref={scrollRef}
            className="bg-surface rounded-xl border border-border shadow-sm overflow-auto"
            style={{ maxHeight: 'calc(100vh - 260px)' }}
          >
            {/* Header com nomes dos profissionais */}
            <div className="flex border-b border-border sticky top-0 bg-surface z-10 min-w-fit">
              <div className="w-14 shrink-0" />
              {professionals.map((p) => (
                <div
                  key={p.id}
                  className="flex-1 min-w-[160px] px-3 py-2 flex items-center gap-2 border-l border-border"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-soft text-primary-soft-foreground text-[11px] font-semibold shrink-0">
                    {p.nome.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">{p.nome}</span>
                </div>
              ))}
            </div>

            {/* Dia sem nenhuma reserva: aviso flutuante discreto, colado sob o
                cabeçalho (sticky acompanha o scroll). O CTA é o mesmo botão
                Nova reserva de sempre. */}
            {!loading && appointments.length === 0 && (
              <div className="sticky top-[52px] z-[5] h-0 flex justify-center pointer-events-none">
                <div className="translate-y-5 pointer-events-auto flex items-center gap-3 bg-surface border border-border shadow-sm rounded-full pl-4 pr-1.5 py-1.5 text-sm text-muted-foreground">
                  Nenhuma reserva {WEEKDAY_FULL[selectedDate.getDay()] === 'sábado' || WEEKDAY_FULL[selectedDate.getDay()] === 'domingo' ? 'neste' : 'nesta'}{' '}
                  {WEEKDAY_FULL[selectedDate.getDay()]}
                  <button onClick={() => setModalState({})} className="btn-chip btn-chip-primario">
                    Nova reserva
                  </button>
                </div>
              </div>
            )}

            {/* Grade */}
            <div className="flex min-w-fit pt-3 pb-3 relative">
              <LinhaDeAgora selectedDate={selectedDate} />
              <div className="w-14 shrink-0 relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
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
                  {/* Fora da jornada fica cinza; branco = disponível. */}
                  {sombrasDaColuna(p.id).map(([topo, altura], i) => (
                    <div
                      key={`sombra-${i}`}
                      aria-hidden
                      className="absolute inset-x-0 bg-surface-2/70 pointer-events-none"
                      style={{ top: topo, height: altura }}
                    />
                  ))}

                  {hours.slice(0, -1).map((h) => (
                    <button
                      key={h}
                      onClick={() => handleSlotClick(p.id, h)}
                      className="group absolute inset-x-0 border-t border-border hover:bg-surface-2/80 text-left"
                      style={{ top: (h - HOUR_START) * ROW_HEIGHT, height: ROW_HEIGHT }}
                      aria-label={`Adicionar horário às ${h}:00 com ${p.nome}`}
                    >
                      {/* Meia hora tracejada: o arrasto encaixa de 15 em 15,
                          mas a régua só marca horas cheias. */}
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50 pointer-events-none"
                      />
                      {/* Convite de clique: só no hover, e some no toque. */}
                      <span className="hidden group-hover:inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 pt-1 tabular-nums">
                        <Plus size={12} />
                        {String(h).padStart(2, '0')}:00
                      </span>
                    </button>
                  ))}

                  {appointmentsFor(p.id).map((appt) => (
                    <AppointmentBlock
                      key={appt.id}
                      appt={appt}
                      dragging={draggingId === appt.id}
                      onDragStart={() => setDraggingId(appt.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setDetailAppt(appt)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {rescheduling && <p className="text-xs text-muted-foreground mt-2">Reagendando...</p>}
        {rescheduleError && (
          <div className="mt-2">
            <ErroInline>
              <span className="flex items-center gap-2">
                {rescheduleError}
                <button onClick={() => setRescheduleError(null)} className="underline">
                  fechar
                </button>
              </span>
            </ErroInline>
          </div>
        )}
      </div>

      <div className="w-full lg:w-72 shrink-0 space-y-4">
        {/* Card-herói preenchido (referência CheckinOs, "Occupancy Rate"):
            o único bloco de cor cheia da tela, para o número do dia. */}
        <div className="bg-primary text-primary-foreground rounded-xl p-4 shadow-md shadow-primary/20">
          <div className="flex items-start justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Reservas
            </div>
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-foreground/15">
              <CalendarDays size={16} />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums leading-none">
              {appointments.length}
            </span>
            <span className="text-xs text-primary-foreground/70">
              {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </span>
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

      {detailAppt && (
        <AppointmentDetailModal
          appointment={detailAppt}
          onClose={() => setDetailAppt(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}
