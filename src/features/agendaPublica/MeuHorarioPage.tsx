import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarX2, Check, Clock, MessageCircle } from 'lucide-react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { invokeFunction } from '../../lib/invokeFunction'
import { ErroInline } from '../../components/ErroInline'

/**
 * A página do link de gestão — item 12 da realidade do balcão.
 *
 * Aberta sem login por quem marcou pelo QR. O token do link é a autorização
 * inteira: ele só abre ESTE agendamento, então não há nada de ninguém para
 * vazar. Cancelar pede confirmação e respeita a antecedência mínima (30min) —
 * a regra mora na edge function, esta tela só a explica.
 *
 * Remarcar não remarca aqui de propósito: reagendar é conversa (outro dia,
 * outro horário, outra preferência), e conversa é com a barbearia no WhatsApp
 * — o botão leva direto para lá.
 */

type Horario = {
  status: string
  inicio: string
  servico: string | null
  barbeiro: string | null
  barbearia: string | null
  whatsappBarbearia: string | null
}

/**
 * No fuso da barbearia, não no do navegador (M9 do giro de 10/09). A página é
 * pública: quem abre o link com o celular em outro fuso — viajando, ou com o
 * aparelho mal configurado — via o horário deslocado, sem aviso nenhum.
 */
function formatar(inicio: string) {
  const d = new Date(inicio)
  return {
    dia: d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }),
    hora: d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }),
  }
}

/**
 * O título de cada estado (M9). Antes, tudo o que não era `cancelado` caía no
 * check verde de "Horário marcado" — inclusive quem já tinha sido atendido e
 * quem ficou como falta.
 *
 * `faltou` recebe "já passou", e não "você não veio", de propósito: desde a
 * 0153 a falta é DEDUZIDA (nenhuma venda até 15 minutos depois do fim) e pode
 * estar errada — o barbeiro lançou tarde. "Já passou" é verdade nos dois casos;
 * "você não veio" seria acusar quem veio.
 */
function tituloDo(status: string) {
  if (status === 'confirmado') return 'Horário confirmado'
  if (status === 'agendado') return 'Horário marcado'
  if (status === 'cancelado') return 'Horário cancelado'
  if (status === 'concluido') return 'Atendimento concluído'
  return 'Este horário já passou'
}

export function MeuHorarioPage() {
  const { token } = useParams<{ token: string }>()
  const [dados, setDados] = useState<Horario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const { data, error } = await invokeFunction<Horario>('agenda-publica', {
      body: { acao: 'meu_horario', token },
    })
    setCarregando(false)
    if (error || !data) {
      setErro(error ?? 'Não foi possível abrir este link. Confira se ele está completo.')
      return
    }
    setDados(data)
  }, [token])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function cancelar() {
    setCancelando(true)
    setErro(null)
    const { data, error } = await invokeFunction<Horario & { ok?: boolean; error?: string }>(
      'agenda-publica',
      { body: { acao: 'cancelar_horario', token } },
    )
    setCancelando(false)
    setConfirmando(false)
    if (data) setDados(data)
    if (error || !data?.ok) {
      setErro(error ?? 'Não foi possível cancelar. Tente novamente.')
      return
    }
  }

  const f = dados ? formatar(dados.inicio) : null
  const dePe = dados?.status === 'agendado' || dados?.status === 'confirmado'
  // Check verde só para o que está de pé ou foi atendido; cancelado e horário
  // que passou ficam neutros.
  const positivo = dePe || dados?.status === 'concluido'
  const linkWhats = dados?.whatsappBarbearia ? `https://wa.me/${dados.whatsappBarbearia}` : null

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary text-primary-foreground shrink-0">
            <MarcaClubCut size={20} />
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground leading-tight">
            {dados?.barbearia ?? 'Seu horário'}
          </span>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Abrindo seu horário...</p>
        ) : !dados ? (
          <ErroInline>{erro}</ErroInline>
        ) : (
          <div className="surge rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
            <div className={`flex items-center gap-2 ${positivo ? 'text-success' : 'text-muted-foreground'}`}>
              {positivo ? <Check size={20} /> : <CalendarX2 size={20} />}
              <h1 className="text-base font-semibold text-foreground">{tituloDo(dados.status)}</h1>
            </div>

            <div className="rounded-lg bg-surface-2 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                <Clock size={16} className="text-primary" />
                {f?.dia}, {f?.hora}
              </div>
              <div className="text-sm text-muted-foreground">
                {dados.servico ?? 'Serviço'}
                {dados.barbeiro ? ` · com ${dados.barbeiro}` : ''}
              </div>
            </div>

            <ErroInline>{erro}</ErroInline>

            {dePe && (
              <div className="space-y-2">
                {linkWhats && (
                  <a
                    href={linkWhats}
                    className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
                  >
                    <MessageCircle size={16} />
                    Mudar o horário pelo WhatsApp
                  </a>
                )}
                {confirmando ? (
                  <div className="rounded-lg border border-danger/40 bg-surface-2 p-3 space-y-2">
                    <p className="text-sm text-foreground">
                      Cancelar o horário de {f?.hora}? A vaga é liberada para outra pessoa.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelar}
                        disabled={cancelando}
                        className="flex-1 btn-danger rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {cancelando ? 'Cancelando...' : 'Sim, cancelar'}
                      </button>
                      <button
                        onClick={() => setConfirmando(false)}
                        disabled={cancelando}
                        className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                      >
                        Manter
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmando(true)}
                    className="w-full btn-ghost rounded-lg px-3 py-2.5 text-sm font-medium text-danger"
                  >
                    Cancelar este horário
                  </button>
                )}
              </div>
            )}

            {/* Todo estado que não está de pé termina numa porta para marcar de
                novo (M9): atendido, cancelado ou horário que passou — antes,
                só o cancelado tinha botão, e os outros ficavam num beco. */}
            {!dePe && linkWhats && (
              <a
                href={linkWhats}
                className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
              >
                <MessageCircle size={16} />
                {dados.status === 'concluido'
                  ? 'Marcar o próximo pelo WhatsApp'
                  : 'Marcar outro horário pelo WhatsApp'}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
