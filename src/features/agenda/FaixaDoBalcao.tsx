import { useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRecurso } from '../recursos/useRecurso'
import type { Appointment } from './types'

/**
 * Quem chegou no balcão — o check-in.
 *
 * O sistema sabia o que foi *marcado*, nunca o que *aconteceu*. Sem isso,
 * `faltou` é palpite do barbeiro, adiantar quem espera é decisão de cabeça, e a
 * política de atraso não tem em que se apoiar.
 *
 * **Por que é o barbeiro quem marca, e não o cliente.** Se o check-in fosse do
 * cliente, ele seria opcional na prática — metade não faria. E aí a ausência do
 * sinal passaria a significar duas coisas ao mesmo tempo: "não veio" e "veio,
 * mas não avisou". A política de atraso age justamente sobre a ausência, então
 * liberaria o horário de quem está sentado ali esperando. Um check-in que às
 * vezes acontece é pior que nenhum, porque dá confiança num dado que não a
 * merece.
 *
 * **Por que uma faixa, e não um botão no modal de detalhe.** O barbeiro não
 * larga a tesoura quando alguém entra. O momento real em que ele olha a tela é
 * entre um corte e outro, e a pergunta é sempre a mesma: quem está aí e quem é
 * o próximo. Abrir agendamento, achar botão e fechar é lento demais para isso.
 */

/** Quanto tempo depois do horário alguém ainda aparece em "a chegar". Passou
 *  disso sem dar sinal, some da faixa — mas continua na agenda, porque sumir
 *  daqui não é marcar falta. */
const MINUTOS_DE_TOLERANCIA = 90

function minutosDesde(iso: string, agora: number) {
  return Math.floor((agora - new Date(iso).getTime()) / 60000)
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function FaixaDoBalcao({
  appointments,
  data,
  onChanged,
}: {
  appointments: Appointment[]
  /** O dia que a agenda está mostrando. O balcão só existe para hoje. */
  data: Date
  onChanged: () => void
}) {
  const temBalcao = useRecurso('balcao')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // "Esperando há 8 minutos" precisa andar sozinho, senão o barbeiro lê um
  // número congelado da hora em que abriu a tela e confia nele.
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const ehHoje = useMemo(() => {
    const hoje = new Date()
    return (
      data.getDate() === hoje.getDate() &&
      data.getMonth() === hoje.getMonth() &&
      data.getFullYear() === hoje.getFullYear()
    )
  }, [data])

  const { esperando, aChegar } = useMemo(() => {
    const relevantes = appointments.filter(
      (a) => a.status !== 'bloqueio' && a.status !== 'cancelado' && a.status !== 'concluido',
    )
    return {
      esperando: relevantes
        .filter((a) => a.chegou_em)
        .sort((a, b) => (a.chegou_em! < b.chegou_em! ? -1 : 1)),
      aChegar: relevantes
        .filter((a) => !a.chegou_em && a.status !== 'faltou')
        .filter((a) => minutosDesde(a.data_hora_inicio, agora) <= MINUTOS_DE_TOLERANCIA)
        .sort((a, b) => (a.data_hora_inicio < b.data_hora_inicio ? -1 : 1)),
    }
  }, [appointments, agora])

  async function marcar(id: string, chegou: boolean) {
    setSalvando(id)
    setErro(null)
    const { error } = await supabase
      .from('appointments')
      .update({ chegou_em: chegou ? new Date().toISOString() : null })
      .eq('id', id)
    setSalvando(null)
    if (error) {
      console.error('Erro ao marcar chegada:', error)
      setErro('Não foi possível salvar. Tente de novo.')
      return
    }
    onChanged()
  }

  if (!temBalcao || !ehHoje) return null
  if (esperando.length === 0 && aChegar.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Users size={15} />
        No balcão
      </div>

      {esperando.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Esperando ({esperando.length})
          </p>
          {esperando.map((a) => {
            const espera = minutosDesde(a.chegou_em!, agora)
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-success/40 bg-success-soft p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {a.client_nome ?? 'Sem nome'}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hora(a.data_hora_inicio)} · {a.service_nome ?? 'sem serviço'} ·{' '}
                    {espera <= 0 ? 'chegou agora' : `esperando há ${espera} min`}
                  </div>
                </div>
                {/* Desfazer existe porque um toque errado no balcão é questão de
                    tempo, e sem saída o barbeiro para de confiar na faixa. */}
                <button
                  onClick={() => marcar(a.id, false)}
                  disabled={salvando === a.id}
                  aria-label={`Desfazer chegada de ${a.client_nome ?? 'cliente'}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {aChegar.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">A chegar</p>
          {aChegar.map((a) => {
            const atraso = minutosDesde(a.data_hora_inicio, agora)
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border-strong p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {a.client_nome ?? 'Sem nome'}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hora(a.data_hora_inicio)} · {a.service_nome ?? 'sem serviço'}
                    {atraso > 0 && <span className="text-warning"> · {atraso} min de atraso</span>}
                  </div>
                </div>
                <button
                  onClick={() => marcar(a.id, true)}
                  disabled={salvando === a.id}
                  className="shrink-0 inline-flex items-center gap-1.5 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Check size={15} />
                  Chegou
                </button>
              </div>
            )
          })}
        </div>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
    </div>
  )
}
