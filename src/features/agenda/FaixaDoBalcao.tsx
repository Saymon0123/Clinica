import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Play, Receipt, RotateCcw, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRecurso } from '../recursos/useRecurso'
import type { Appointment } from './types'

/**
 * O balcão: quem chegou, quem está na cadeira e quem é o próximo.
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
 *
 * **Nenhum dos toques é obrigatório para o sistema estar certo.** Um barbeiro
 * corrido pode ignorar a faixa inteira e a agenda continua funcionando — a
 * ausência de marcação nunca pune ninguém sozinha. Essa é a razão de o passo
 * seguinte (política de atraso) só poder *avisar*, nunca liberar por conta
 * própria.
 */

/** Quanto tempo depois do horário alguém ainda aparece em "a chegar". Passou
 *  disso sem dar sinal, some da faixa — mas continua na agenda, porque sumir
 *  daqui não é marcar falta. */
const MINUTOS_DE_TOLERANCIA = 90

/**
 * Quanto de atraso antes de oferecer "Não veio".
 *
 * Oferecer no horário em ponto convida a toque errado e é grosseiro com quem
 * está chegando. Dez minutos é o número que o dono do produto definiu para a
 * política de atraso — nasce aqui como constante e, no passo 6, vira ajuste por
 * barbearia em Configurações.
 */
const MINUTOS_PARA_MARCAR_FALTA = 10

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
  const navigate = useNavigate()
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

  const { naCadeira, esperando, aChegar, naoVieram } = useMemo(() => {
    const relevantes = appointments.filter(
      (a) => a.status !== 'bloqueio' && a.status !== 'cancelado' && a.status !== 'concluido',
    )
    return {
      naCadeira: relevantes
        .filter((a) => a.iniciado_em)
        .sort((a, b) => (a.iniciado_em! < b.iniciado_em! ? -1 : 1)),
      esperando: relevantes
        .filter((a) => a.chegou_em && !a.iniciado_em)
        .sort((a, b) => (a.chegou_em! < b.chegou_em! ? -1 : 1)),
      aChegar: relevantes
        .filter((a) => !a.chegou_em && a.status !== 'faltou')
        .filter((a) => minutosDesde(a.data_hora_inicio, agora) <= MINUTOS_DE_TOLERANCIA)
        .sort((a, b) => (a.data_hora_inicio < b.data_hora_inicio ? -1 : 1)),
      // Fica visível só para poder ser desfeito. Some quando o dia vira.
      naoVieram: relevantes
        .filter((a) => a.status === 'faltou')
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

  /**
   * Marcar falta **libera a cadeira na hora**, em todos os canais: as duas
   * travas de sobreposição e o `horarios_livres` ignoram `faltou`. É o que faz
   * o check-in pagar — o horário volta a ser vendável para quem está no balcão.
   *
   * Não é o mesmo que cancelar, embora para a cadeira dê no mesmo. Cancelar é
   * "não vai acontecer, combinado"; faltou é "marcou e não veio". A diferença
   * mora no histórico do cliente, que é o que a política de atraso vai olhar.
   */
  async function marcarFalta(id: string, faltou: boolean) {
    setSalvando(id)
    setErro(null)
    const { error } = await supabase
      .from('appointments')
      .update({ status: faltou ? 'faltou' : 'agendado' })
      .eq('id', id)
    setSalvando(null)
    if (error) {
      console.error('Erro ao marcar falta:', error)
      // Desfazer devolve o agendamento ao estado que ocupa horário, e nesse
      // meio-tempo a cadeira pode ter sido vendida para outra pessoa — foi
      // justamente esse o objetivo de marcar a falta. A trava de sobreposição
      // barra, e o barbeiro precisa entender o motivo em vez de ver "erro".
      setErro(
        error.code === '23P01'
          ? 'Esse horário já foi ocupado por outra pessoa. Marque uma nova reserva.'
          : 'Não foi possível salvar. Tente de novo.',
      )
      return
    }
    onChanged()
  }

  /** Sentou na cadeira, ou levantou por engano do barbeiro. */
  async function iniciar(id: string, comecou: boolean) {
    setSalvando(id)
    setErro(null)
    const { error } = await supabase
      .from('appointments')
      .update({ iniciado_em: comecou ? new Date().toISOString() : null })
      .eq('id', id)
    setSalvando(null)
    if (error) {
      console.error('Erro ao iniciar atendimento:', error)
      setErro('Não foi possível salvar. Tente de novo.')
      return
    }
    onChanged()
  }

  /**
   * Terminar leva para o caixa, e não marca `concluido` direto.
   *
   * O CRM não tem "Concluir" solto — só "Concluir e cobrar", que é deliberado:
   * atendimento fechado fora do caixa é dinheiro que some do financeiro. Um
   * botão aqui que só mudasse o status criaria essa segunda porta, e ela seria
   * a mais usada, porque é a que fica na mão do barbeiro o dia inteiro.
   */
  function terminar(a: Appointment) {
    const params = new URLSearchParams({ appointmentId: a.id })
    if (a.client_id) params.set('clientId', a.client_id)
    if (a.professional_id) params.set('professionalId', a.professional_id)
    if (a.service_id) params.set('serviceId', a.service_id)
    navigate(`/financeiro?${params.toString()}`)
  }

  if (!temBalcao || !ehHoje) return null
  if (
    naCadeira.length === 0 &&
    esperando.length === 0 &&
    aChegar.length === 0 &&
    naoVieram.length === 0
  )
    return null

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Users size={15} />
        No balcão
      </div>

      {naCadeira.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Na cadeira</p>
          {naCadeira.map((a) => {
            // A duração prevista vem do próprio agendamento, que o trigger do
            // banco já calculou pelo serviço — não precisa de campo novo.
            const duracao =
              new Date(a.data_hora_fim).getTime() - new Date(a.data_hora_inicio).getTime()
            const previsto = new Date(new Date(a.iniciado_em!).getTime() + duracao)
            const passou = Math.floor((agora - previsto.getTime()) / 60000)
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-primary bg-primary-soft p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-primary-soft-foreground">
                    {a.client_nome ?? 'Sem nome'}
                  </div>
                  <div className="truncate text-xs text-primary-soft-foreground/70">
                    {a.service_nome ?? 'sem serviço'} ·{' '}
                    {/* É esta linha que responde "quanto falta?" para quem
                        espera — o motivo de existir o "em atendimento". */}
                    {passou > 0 ? (
                      <span className="text-warning">passou {passou} min do previsto</span>
                    ) : (
                      `termina por volta de ${previsto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    )}
                  </div>
                </div>
                <button
                  onClick={() => terminar(a)}
                  disabled={salvando === a.id}
                  className="shrink-0 inline-flex items-center gap-1.5 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Receipt size={15} />
                  Terminar
                </button>
                <button
                  onClick={() => iniciar(a.id, false)}
                  disabled={salvando === a.id}
                  aria-label={`Desfazer início de ${a.client_nome ?? 'cliente'}`}
                  className="shrink-0 rounded-lg p-2 text-primary-soft-foreground/70 hover:bg-surface-2 disabled:opacity-50"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

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
                <button
                  onClick={() => iniciar(a.id, true)}
                  disabled={salvando === a.id}
                  className="shrink-0 inline-flex items-center gap-1.5 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Play size={15} />
                  Iniciar
                </button>
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
                {/* "Não veio" só depois dos 10 minutos: no horário em ponto
                    convida a toque errado e é grosseiro com quem está a caminho. */}
                {atraso >= MINUTOS_PARA_MARCAR_FALTA && (
                  <button
                    onClick={() => marcarFalta(a.id, true)}
                    disabled={salvando === a.id}
                    className="shrink-0 rounded-lg border border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
                  >
                    Não veio
                  </button>
                )}
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

      {naoVieram.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Não vieram</p>
          {naoVieram.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2.5 opacity-70"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground line-through">
                  {a.client_nome ?? 'Sem nome'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {hora(a.data_hora_inicio)} · horário liberado para outro cliente
                </div>
              </div>
              <button
                onClick={() => marcarFalta(a.id, false)}
                disabled={salvando === a.id}
                aria-label={`Desfazer falta de ${a.client_nome ?? 'cliente'}`}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
    </div>
  )
}
