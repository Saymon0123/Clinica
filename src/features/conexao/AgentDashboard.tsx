import { useState } from 'react'
import { Bot, CalendarCheck, CalendarX, Hand, MessageSquare, Timer } from 'lucide-react'
import { useAgentStats, type AgentPeriod } from './useAgentStats'
import { ErroInline } from '../../components/ErroInline'

function formatResponseTime(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const min = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${min}min ${rest}s` : `${min}min`
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-soft text-primary-soft-foreground">
          {icon}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

export function AgentDashboard({ salonId }: { salonId: string }) {
  const [period, setPeriod] = useState<AgentPeriod>('mes')
  const { stats, loading, error } = useAgentStats(salonId, period)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Desempenho do atendimento automático</h2>
          <p className="text-xs text-muted-foreground">
            O que o agente de IA resolveu {period === 'semana' ? 'nesta semana' : 'neste mês'}
          </p>
        </div>

        <div className="inline-flex rounded-lg bg-surface-2 border border-border p-1 text-sm">
          <button
            onClick={() => setPeriod('semana')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              period === 'semana' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setPeriod('mes')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              period === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Mês
          </button>
        </div>
      </div>

      <ErroInline>{error}</ErroInline>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          icon={<Bot size={16} />}
          label="Conversas atendidas"
          value={loading ? '—' : stats.conversas}
          hint="clientes que o agente respondeu"
        />
        <StatCard
          icon={<Timer size={16} />}
          label="Tempo de resposta"
          value={loading ? '—' : formatResponseTime(stats.tempoRespostaMedioSeg)}
          hint="média do agente"
        />
        <StatCard
          icon={<MessageSquare size={16} />}
          label="Mensagens enviadas"
          value={loading ? '—' : stats.mensagensAgente}
          hint="pelo agente"
        />
        <StatCard
          icon={<CalendarCheck size={16} />}
          label="Agendamentos"
          value={loading ? '—' : stats.agendamentos}
          hint="feitos pelo agente (a cobrança na aba Assinatura usa o mês fechado)"
        />
        <StatCard
          icon={<CalendarX size={16} />}
          label="Cancelamentos"
          value={loading ? '—' : stats.cancelamentos}
          hint="pelo agente"
        />
        <StatCard
          icon={<Hand size={16} />}
          label="Pediram o dono"
          value={loading ? '—' : stats.pedidosDono}
          hint="aguardando você na aba WEB"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Agendamentos e cancelamentos contam apenas os que passaram pelo agente no WhatsApp — o que você
        faz direto na agenda não entra aqui.
      </p>

      {/* Reativação: o sistema reserva o próximo horário de quem topou o
          agendamento automático e confirma por WhatsApp. Sempre do mês
          corrente — é o número que mostra o sistema trazendo gente de volta. */}
      {stats.reativacao && stats.reativacao.enviados > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Reativação — clientes trazidos de volta</h3>
            <p className="text-xs text-muted-foreground">
              Horários que o sistema reservou e confirmou sozinho neste mês
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-lg font-bold text-foreground">{stats.reativacao.enviados}</p>
              <p className="text-xs text-muted-foreground">convites enviados</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-lg font-bold text-success">{stats.reativacao.confirmados}</p>
              <p className="text-xs text-muted-foreground">confirmaram</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-lg font-bold text-foreground">{stats.reativacao.remarcados}</p>
              <p className="text-xs text-muted-foreground">preferiram remarcar</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-lg font-bold text-foreground">
                {Number(stats.reativacao.receita_concluida).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
              <p className="text-xs text-muted-foreground">gerados em cortes concluídos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
