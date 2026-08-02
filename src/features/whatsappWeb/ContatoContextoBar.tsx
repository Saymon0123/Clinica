import { CalendarClock, UserPlus, UserRound } from 'lucide-react'
import type { ContatoContexto } from './useContatoContexto'

function data(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Faixa com o que o dono precisa saber antes de responder.
 *
 * Fica **acima** das mensagens de propósito: a decisão de como falar com a
 * pessoa vem antes de ler a conversa. "Tem horário amanhã às 15h" muda a
 * resposta inteira, e antes disso exigia abrir a Agenda em outra aba.
 */
export function ContatoContextoBar({
  contexto,
  loading,
}: {
  contexto: ContatoContexto | null
  loading: boolean
}) {
  if (loading) return null

  if (!contexto) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-border text-xs text-muted-foreground">
        <UserPlus size={13} className="shrink-0" />
        <span>Este número ainda não está cadastrado como cliente.</span>
      </div>
    )
  }

  const { ultimaVisita, proximoAgendamento, totalVisitas, clienteDesde } = contexto

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-surface-2 border-b border-border text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <UserRound size={13} className="shrink-0" />
        Cliente desde {data(clienteDesde)}
      </span>

      <span>
        {totalVisitas === 0
          ? 'Nunca foi atendido'
          : `${totalVisitas} ${totalVisitas === 1 ? 'atendimento' : 'atendimentos'}`}
        {ultimaVisita && ` · último em ${data(ultimaVisita)}`}
      </span>

      {/* O horário marcado é a informação mais acionável da faixa: destacada,
          porque muda o que o dono responde. */}
      {proximoAgendamento && (
        <span className="flex items-center gap-1.5 font-medium text-primary">
          <CalendarClock size={13} className="shrink-0" />
          Tem horário em {dataHora(proximoAgendamento)}
        </span>
      )}
    </div>
  )
}
