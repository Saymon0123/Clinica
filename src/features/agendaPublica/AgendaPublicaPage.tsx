import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Clock, Scissors } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'

/**
 * A página que o QR do balcão abre.
 *
 * Aberta **sem login**, por quem está de pé na barbearia com o celular na mão.
 * Tudo aqui é desenhado para esse contexto: telefone, pressa, e uma pessoa que
 * nunca viu o sistema.
 *
 * A ordem — serviço, depois horário, depois quem é você — não é arbitrária. O
 * horário livre **depende da duração do serviço**, então perguntar o serviço
 * antes é o que evita oferecer 14:45 para um corte que leva uma hora. E o nome
 * fica por último porque é o único passo chato: pedir antes faria a pessoa
 * decidir se vale a pena sem nem saber se tem horário.
 *
 * Mostra por **horário**, com o barbeiro em cada um, e não o contrário. Escolher
 * o barbeiro primeiro e descobrir que ele está cheio é porta fechada; ver que
 * tem 14:30 com o Rafael é porta aberta.
 */
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Horario = { professional_id: string; profissional: string; inicio: string; hora_local: string }
type Consulta = {
  salao: string
  servicos: Servico[]
  servicoEscolhido?: string
  horarios: Horario[]
}

export function AgendaPublicaPage() {
  const { salonId } = useParams<{ salonId: string }>()

  const [dados, setDados] = useState<Consulta | null>(null)
  const [servicoId, setServicoId] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState<Horario | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const consultar = useCallback(
    async (servico?: string) => {
      setCarregando(true)
      setErro(null)
      const { data, error } = await invokeFunction<Consulta>('agenda-publica', {
        body: { salonId, acao: 'consultar', servicoId: servico },
      })
      setCarregando(false)
      if (error || !data) {
        setErro(error ?? 'Não foi possível carregar os horários.')
        return
      }
      setDados(data)
      setServicoId(data.servicoEscolhido ?? null)
    },
    [salonId],
  )

  useEffect(() => {
    consultar()
  }, [consultar])

  async function agendar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!nome.trim()) return setErro('Informe seu nome.')
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Informe seu WhatsApp com DDD.')
    if (!escolhido || !servicoId) return setErro('Escolha um horário.')

    setEnviando(true)
    const { data, error } = await invokeFunction<{ ok: boolean; conflito?: boolean }>(
      'agenda-publica',
      {
        body: {
          salonId,
          acao: 'agendar',
          nome: nome.trim(),
          telefone: telefone.trim(),
          servicoId,
          profissionalId: escolhido.professional_id,
          inicio: escolhido.inicio,
        },
      },
    )
    setEnviando(false)

    if (error || !data?.ok) {
      setErro(error ?? 'Não foi possível agendar.')
      // Horário tomado enquanto ela preenchia: volta para a lista já
      // atualizada, em vez de deixá-la tentando de novo no mesmo horário.
      setEscolhido(null)
      consultar(servicoId ?? undefined)
      return
    }
    setPronto(true)
  }

  const servico = dados?.servicos.find((s) => s.id === servicoId)

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <Scissors size={18} />
          </span>
          <span className="font-semibold text-foreground">{dados?.salao ?? 'Carregando...'}</span>
        </div>

        {pronto ? (
          <div className="rounded-xl border border-success/40 bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 text-success">
              <Check size={20} />
              <h1 className="text-base font-semibold">Horário marcado!</h1>
            </div>
            <p className="text-sm text-foreground">
              <strong>{escolhido?.hora_local}</strong> com {escolhido?.profissional}
              {servico ? ` — ${servico.nome}` : ''}.
            </p>
            <p className="text-sm text-muted-foreground">
              É só aguardar. Se precisar mudar alguma coisa, fale com a barbearia.
            </p>
          </div>
        ) : carregando ? (
          <p className="text-sm text-muted-foreground">Carregando horários...</p>
        ) : !dados ? (
          <p className="text-sm text-danger">{erro}</p>
        ) : escolhido ? (
          // ---------- Passo 3: quem é você ----------
          <form onSubmit={agendar} className="space-y-4">
            <div className="rounded-lg border border-primary/40 bg-primary-soft/40 p-3">
              <div className="text-sm font-medium text-foreground">
                {escolhido.hora_local} com {escolhido.profissional}
              </div>
              {servico && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {servico.nome} · R$ {servico.preco} · {servico.duracao_minutos} min
                </div>
              )}
              <button
                type="button"
                onClick={() => setEscolhido(null)}
                className="text-xs text-primary hover:underline mt-1"
              >
                trocar horário
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Seu nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-3 text-base"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Seu WhatsApp</span>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(41) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-3 text-base"
              />
              <span className="block text-[11px] text-muted-foreground mt-1">
                É por aqui que a barbearia fala com você sobre esse horário.
              </span>
            </label>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="w-full btn-primary rounded px-3 py-3 text-base font-medium disabled:opacity-50"
            >
              {enviando ? 'Marcando...' : 'Confirmar horário'}
            </button>
          </form>
        ) : (
          // ---------- Passos 1 e 2: serviço e horário ----------
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground">O que você quer fazer?</label>
              <select
                value={servicoId ?? ''}
                onChange={(e) => {
                  setServicoId(e.target.value)
                  consultar(e.target.value)
                }}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-3 text-base"
              >
                {dados.servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} — R$ {s.preco}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Clock size={13} />
                Horários livres hoje
              </div>

              {dados.horarios.length === 0 ? (
                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  Não há horário livre hoje para esse serviço. Tente outro serviço ou fale com a
                  barbearia.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {dados.horarios.map((h) => (
                    <button
                      key={`${h.professional_id}-${h.inicio}`}
                      onClick={() => {
                        setEscolhido(h)
                        setErro(null)
                      }}
                      className="rounded-lg border border-border-strong p-3 text-left hover:bg-surface-2"
                    >
                      <div className="text-base font-semibold text-foreground">{h.hora_local}</div>
                      <div className="text-xs text-muted-foreground truncate">{h.profissional}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground pt-2">
          Ao agendar, você concorda com a{' '}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
            política de privacidade
          </a>
          .
        </p>
      </div>
    </div>
  )
}
