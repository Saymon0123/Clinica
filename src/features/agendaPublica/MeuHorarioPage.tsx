import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, CalendarX2, Check, Clock, MessageCircle, Scissors } from 'lucide-react'
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
 * REMARCAR PASSOU A REMARCAR (13/09/2026). Esta linha dizia o contrário:
 * "reagendar é conversa (outro dia, outro horário, outra preferência), e
 * conversa é com a barbearia no WhatsApp". Era verdade enquanto o QR só marcava
 * para HOJE — escolher outro dia exigia negociar. Com a janela de catorze dias
 * a grade inteira está na tela, e mandar a pessoa conversar para tocar em dois
 * botões virou atrito, não cuidado.
 *
 * A escolha do horário novo NÃO mora aqui: o botão leva para a agenda pública
 * em modo remarcar (`/agendar/:salonId?remarcar=<token>`), que já tem a faixa
 * de catorze dias, a grade por período e o destaque do próximo horário. Duas
 * cópias disso garantiriam que uma envelheceria.
 */

type Horario = {
  status: string
  inicio: string
  /** O servico PRINCIPAL. Continua vindo por compatibilidade de implantacao. */
  /** De qual barbearia — para o botao de remarcar abrir a grade dela. */
  salonId?: string | null
  servico: string | null
  /** Todos os servicos, na ordem escolhida. Ausente numa edge anterior a
   *  selecao multipla (13/09) -- e ai o principal sozinho e a verdade.
   *  O `id` chegou com o editor de servicos (21/09): sem ele -- edge antiga
   *  ainda no ar enquanto a Vercel termina o build -- o editor nao aparece,
   *  pela mesma razao do `salonId` no botao de remarcar. */
  servicos?: { id?: string | null; nome: string | null; preco: number | null }[]
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
/** Um serviço do cardápio, para o editor montar a lista. */
type ServicoDoCatalogo = { id: string; nome: string; preco: number; duracao_minutos: number }

function precoBR(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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
  // O editor de serviços (21/09): a sobrancelha lembrada dez minutos depois de
  // marcar. Toda a régua — 30 minutos de antecedência, caber antes do próximo
  // cliente, não passar do fechamento — mora na RPC `alterar_servicos_pelo_
  // cliente`; aqui é só escolha e recado. O catálogo é carregado SOB DEMANDA:
  // quem só abre o link para conferir o horário não paga uma consulta a mais.
  const [editando, setEditando] = useState(false)
  const [catalogo, setCatalogo] = useState<ServicoDoCatalogo[] | null>(null)
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false)
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null)
  const [selecao, setSelecao] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erroEditor, setErroEditor] = useState<string | null>(null)

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

  async function abrirEditor(idsAtuais: string[]) {
    setEditando(true)
    setErroEditor(null)
    setSelecao(idsAtuais)
    if (catalogo) return
    setCarregandoCatalogo(true)
    setErroCatalogo(null)
    const { data, error } = await invokeFunction<{ servicos: ServicoDoCatalogo[] }>('agenda-publica', {
      body: { acao: 'catalogo', token },
    })
    setCarregandoCatalogo(false)
    if (error || !data) {
      setErroCatalogo(error ?? 'Não foi possível carregar os serviços. Tente de novo.')
      return
    }
    setCatalogo(data.servicos)
  }

  /** A ORDEM É A DA ESCOLHA, e ela importa: o primeiro da lista vira o serviço
   *  principal do agendamento. Acrescentando a sobrancelha, o corte continua
   *  sendo o principal — que é o que a agenda do CRM e a fatura leem. */
  function alternar(id: string) {
    setSelecao((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
  }

  async function salvarServicos() {
    setSalvando(true)
    setErroEditor(null)
    const { data, error } = await invokeFunction<{ ok?: boolean }>('agenda-publica', {
      body: { acao: 'alterar_servicos', token, servicos: selecao },
    })
    setSalvando(false)
    if (error || !data?.ok) {
      // A recusa já vem explicada pela RPC ("o horário seguinte já está
      // ocupado", "faltam menos de 30 minutos"): repassar o motivo é melhor do
      // que trocar tudo por um "tente novamente" que não ensina nada.
      setErroEditor(error ?? 'Não foi possível mudar os serviços.')
      return
    }
    setEditando(false)
    carregar()
  }

  const f = dados ? formatar(dados.inicio) : null
  const dePe = dados?.status === 'agendado' || dados?.status === 'confirmado'
  const servicosAtuais = dados?.servicos ?? []
  const idsAtuais = servicosAtuais.map((s) => s.id).filter((id): id is string => !!id)
  // Faltando id em algum (edge anterior a esta), o editor não aparece: melhor
  // não oferecer do que oferecer quebrado.
  const podeMexerNosServicos =
    dePe && servicosAtuais.length > 0 && idsAtuais.length === servicosAtuais.length
  // O que a barbearia tirou do cardápio mas ainda está NESTE horário: pode
  // continuar, não pode voltar depois de sair (a mesma regra da migration
  // 0177, dita aqui em voz de gente).
  const foraDoCardapio = servicosAtuais.filter(
    (s) => s.id && !(catalogo ?? []).some((c) => c.id === s.id),
  )
  const opcoes = [
    ...foraDoCardapio.map((s) => ({
      id: s.id as string,
      nome: s.nome ?? 'Serviço',
      preco: s.preco ?? 0,
      saiu: true,
    })),
    ...(catalogo ?? []).map((c) => ({ id: c.id, nome: c.nome, preco: c.preco, saiu: false })),
  ]
  const totalSelecionado = selecao.reduce(
    (total, id) => total + (opcoes.find((o) => o.id === id)?.preco ?? 0),
    0,
  )
  // Sem mudança não há o que salvar — e a chamada seria só uma ida ao servidor
  // para ouvir que nada mudou.
  const mudouAlgo = selecao.join(',') !== idsAtuais.join(',')
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
                {/* Corte + barba aparece inteiro. Quem marcou dois pelo QR lia
                    só "Corte" aqui e ficava sem saber se a barba entrou —
                    justamente na tela que existe para ele conferir. */}
                {dados.servicos?.length
                  ? dados.servicos.map((s) => s.nome).filter(Boolean).join(' + ')
                  : (dados.servico ?? 'Serviço')}
                {dados.barbeiro ? ` · com ${dados.barbeiro}` : ''}
              </div>
            </div>

            <ErroInline>{erro}</ErroInline>

            {/* O editor toma o lugar dos botões enquanto está aberto: duas
                colunas de ação competindo na mesma tela de celular é ruído. */}
            {dePe && editando && (
              <div className="rounded-lg border border-border bg-surface-2 p-3.5 space-y-3">
                <p className="text-sm font-medium text-foreground">O que vai ser feito neste horário</p>

                {carregandoCatalogo ? (
                  <p className="text-sm text-muted-foreground">Carregando os serviços...</p>
                ) : erroCatalogo ? (
                  <ErroInline>{erroCatalogo}</ErroInline>
                ) : opcoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Não há serviços para escolher agora. Chame a barbearia no WhatsApp.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {opcoes.map((o) => (
                      <label
                        key={o.id}
                        className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5 cursor-pointer"
                      >
                        {/* `aria-label` explícito: envolvido pelo <label>, o
                            leitor de tela anunciava só "caixa de seleção,
                            marcada" — sem dizer de qual serviço. */}
                        <input
                          type="checkbox"
                          checked={selecao.includes(o.id)}
                          onChange={() => alternar(o.id)}
                          aria-label={`${o.nome}, ${precoBR(o.preco)}`}
                          className="w-4 h-4 accent-primary shrink-0"
                        />
                        <span className="flex-1 text-sm text-foreground">
                          {o.nome}
                          {o.saiu && (
                            <span className="block text-xs text-muted-foreground">
                              fora do cardápio — tirando, não dá para voltar
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">{precoBR(o.preco)}</span>
                      </label>
                    ))}
                  </div>
                )}

                {selecao.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Total:{' '}
                    <span className="font-medium text-foreground">{precoBR(totalSelecionado)}</span>
                  </p>
                )}

                <ErroInline>{erroEditor}</ErroInline>

                {/* A saída para quem desmarcou tudo: sem serviço não existe
                    horário, e desmarcar tudo NÃO é a mesma coisa que cancelar. */}
                {selecao.length === 0 && !carregandoCatalogo && !erroCatalogo && (
                  <p className="text-xs text-muted-foreground">
                    Escolha ao menos um serviço. Para desistir do horário, use "Cancelar este
                    horário".
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={salvarServicos}
                    disabled={salvando || selecao.length === 0 || !mudouAlgo}
                    className="flex-1 btn-primary rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => {
                      setEditando(false)
                      setErroEditor(null)
                    }}
                    disabled={salvando}
                    className="flex-1 btn-secondary rounded-lg px-3 py-2.5 text-sm font-medium"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {dePe && !editando && (
              <div className="space-y-2">
                {/* O botao que mudou de destino em 13/09: ele levava ao
                    WhatsApp da barbearia, e agora leva a grade. So aparece com
                    `salonId` na resposta -- de uma edge anterior a esta ele nao
                    vem, e um botao que leva a `/agendar/null` e pior que
                    nenhum. */}
                {dados.salonId && (
                  <a
                    href={`/agendar/${dados.salonId}?remarcar=${token}`}
                    className="w-full flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
                  >
                    <CalendarClock size={16} />
                    Mudar o horário
                  </a>
                )}
                {/* Mudar o QUE vai ser feito, sem mexer em QUANDO — o pedido
                    de 21/09: "ele lembra que vai fazer tambem a sobrancelha". */}
                {podeMexerNosServicos && (
                  <button
                    onClick={() => abrirEditor(idsAtuais)}
                    className="w-full flex items-center justify-center gap-2 btn-secondary rounded-lg px-3 py-3 text-sm font-semibold"
                  >
                    <Scissors size={16} />
                    Mudar os serviços
                  </button>
                )}
                {/* O WhatsApp continua ali, em segundo plano: remarcar resolve
                    "quero outro horario", nao "preciso falar com voces". */}
                {linkWhats && (
                  <a
                    href={linkWhats}
                    className="w-full flex items-center justify-center gap-2 btn-secondary rounded-lg px-3 py-3 text-sm font-semibold"
                  >
                    <MessageCircle size={16} />
                    Falar com a barbearia
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
