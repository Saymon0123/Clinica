import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { useParams } from 'react-router-dom'
import { Check, Clock } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'
import { ErroInline } from '../../components/ErroInline'
import { AVISO_TELEFONE_FORMATO, classificarTelefone } from '../../lib/telefone'

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
/** Quantos horários aparecem antes do "ver mais". Seis linhas de dois — cabe na
 *  tela do celular sem rolar, e os primeiros são justamente os mais cedo. */
const PRIMEIROS = 12

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

  // Quem escaneia o QR está de pé no balcão e quer o horário mais cedo. A grade
  // passou de 15 para 10 minutos e ganhou âncora no fim de cada atendimento
  // (migration 0066) — bom para não desperdiçar cadeira, ruim para a lista: num
  // dia de dois barbeiros são mais de oitenta botões, e o mais cedo, que é o que
  // ele veio buscar, fica enterrado sob quarenta linhas de rolagem.
  const [verTodos, setVerTodos] = useState(false)

  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  // O link de gestão: é a única chave para cancelar este horário depois.
  const [tokenGestao, setTokenGestao] = useState<string | null>(null)

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
      // Trocar de serviço muda a lista inteira: volta ao topo, senão ele fica
      // olhando o fim do dia de um serviço que nem escolheu mais.
      setVerTodos(false)
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
    // A mesma régua do banco (CHECK de 10 a 13 dígitos, migration 0128). Só o
    // piso deixava passar 14 dígitos: o insert quebrava lá atrás e voltava um
    // 500 genérico, que aqui ainda derruba a escolha do horário e joga a pessoa
    // de volta na lista — ela perde o que já tinha feito sem saber o motivo.
    // Aqui, diferente do CRM, o campo é obrigatório: vazio tem aviso próprio,
    // porque "deixe em branco" não é opção para quem precisa ser avisado do
    // horário.
    const estadoDoTelefone = classificarTelefone(telefone)
    if (estadoDoTelefone === 'vazio') return setErro('Informe seu WhatsApp com DDD.')
    if (estadoDoTelefone === 'invalido') return setErro(AVISO_TELEFONE_FORMATO)
    if (!escolhido || !servicoId) return setErro('Escolha um horário.')

    setEnviando(true)
    const { data, error } = await invokeFunction<{ ok: boolean; conflito?: boolean; tokenGestao?: string }>(
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
    setTokenGestao(data.tokenGestao ?? null)
    setPronto(true)
  }

  const servico = dados?.servicos.find((s) => s.id === servicoId)

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Cabecalho de marca. Quem escaneia o QR chega sem contexto nenhum: o
            nome da barbearia grande e a primeira coisa que confirma que ele
            esta no lugar certo. */}
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary text-primary-foreground shrink-0">
            <MarcaClubCut size={20} />
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground leading-tight">
            {dados?.salao ?? 'Carregando...'}
          </span>
        </div>

        {pronto ? (
          <div className="surge rounded-xl border border-success/40 bg-surface p-5 space-y-3 shadow-[0_12px_32px_-16px_color-mix(in_srgb,var(--foreground)_40%,transparent)]">
            <div className="flex items-center gap-2 text-success">
              <Check size={20} />
              <h1 className="text-base font-semibold">Horário marcado!</h1>
            </div>
            <p className="text-sm text-foreground">
              <strong>{escolhido?.hora_local}</strong> com {escolhido?.profissional}
              {servico ? `, ${servico.nome}` : ''}.
            </p>
            {tokenGestao ? (
              <p className="text-sm text-muted-foreground">
                Precisou desmarcar?{' '}
                <a
                  href={`/meu-horario/${tokenGestao}`}
                  className="font-medium text-primary underline"
                >
                  Gerencie seu horário por este link
                </a>{' '}
                — salve nos favoritos ou tire um print.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                É só aguardar. Se precisar mudar alguma coisa, fale com a barbearia.
              </p>
            )}
          </div>
        ) : carregando ? (
          <p className="text-sm text-muted-foreground">Carregando horários...</p>
        ) : !dados ? (
          <ErroInline>{erro}</ErroInline>
        ) : escolhido ? (
          // ---------- Passo 3: quem é você ----------
          <form onSubmit={agendar} className="surge space-y-4">
            <div className="rounded-xl border border-primary/40 bg-primary-soft/40 p-4">
              <div className="text-base font-semibold text-foreground">
                {escolhido.hora_local} com {escolhido.profissional}
              </div>
              {servico && (
                <div className="text-xs text-muted-foreground mt-1">
                  {servico.nome} · R$ {servico.preco} · {servico.duracao_minutos} min
                </div>
              )}
              <button
                type="button"
                onClick={() => setEscolhido(null)}
                className="text-xs font-medium text-primary hover:underline mt-2"
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
                className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
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
                className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
              />
              <span className="block text-[11px] text-muted-foreground mt-1.5">
                É por aqui que a barbearia fala com você sobre esse horário.
              </span>
            </label>

            <ErroInline>{erro}</ErroInline>

            <button
              type="submit"
              disabled={enviando}
              className="w-full btn-primary rounded-lg px-3 py-3.5 text-base font-semibold disabled:opacity-50"
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
                className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
              >
                {dados.servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} · R$ {s.preco}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Clock size={14} />
                Horários livres hoje
              </div>

              {dados.horarios.length === 0 ? (
                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  Não há horário livre hoje para esse serviço. Tente outro serviço ou fale com a
                  barbearia.
                </div>
              ) : (
                <div key={servicoId ?? 'todos'} className="surge-stagger grid grid-cols-2 gap-2">
                  {(verTodos ? dados.horarios : dados.horarios.slice(0, PRIMEIROS)).map((h, i) => (
                    <button
                      key={`${h.professional_id}-${h.inicio}`}
                      style={{ '--i': i } as CSSProperties}
                      onClick={() => {
                        setEscolhido(h)
                        setErro(null)
                      }}
                      className="rounded-lg border border-border-strong bg-surface p-3 text-left transition-[border-color,background-color,transform] duration-150 hover:border-primary hover:bg-primary-soft/30 active:scale-[0.98]"
                    >
                      <div className="text-base font-semibold text-foreground">{h.hora_local}</div>
                      <div className="text-xs text-muted-foreground truncate">{h.profissional}</div>
                    </button>
                  ))}
                </div>
              )}

              {!verTodos && dados.horarios.length > PRIMEIROS && (
                <button
                  onClick={() => setVerTodos(true)}
                  className="mt-2 w-full rounded-lg border border-border p-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                >
                  Ver mais {dados.horarios.length - PRIMEIROS} horários
                </button>
              )}
            </div>

            <ErroInline>{erro}</ErroInline>
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
