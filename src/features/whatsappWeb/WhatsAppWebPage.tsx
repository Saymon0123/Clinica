import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, AlertCircle, Bot, MessageCircle, Search, Send, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useConversations } from './useConversations'
import { useMessages } from './useMessages'
import { ThemeToggle } from '../../components/ThemeToggle'
import { ContextPopup } from './ContextPopup'
import { ContatoContextoBar } from './ContatoContextoBar'
import { useContatoContexto } from './useContatoContexto'
import { formatarTelefone } from '../../lib/telefone'
import { filtrarEOrdenar, naoLida } from './lista'
import { montarThread } from './thread'
import { lerResumoVisto, marcarResumoVisto } from './resumoVisto'

type Tab = 'todas' | 'precisa_dono'

/** Duas letras do nome; um ícone quando o contato ainda não tem nome. */
function iniciais(nome: string | null) {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return <MessageCircle size={18} />
  const primeira = partes[0][0]
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function WhatsAppWebPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [tab, setTab] = useState<Tab>('todas')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [busca, setBusca] = useState('')

  const { conversations: todas, loading, error, reload: reloadConversations } = useConversations(salonId)

  const aguardandoDono = todas.filter((c) => c.needs_human)

  // ?conversa=<id> abre direto a conversa certa — é o link do alerta global
  // "cliente pedindo você". Só na chegada: depois o clique manda.
  const conversaInicialRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('conversa'),
  )
  useEffect(() => {
    const alvo = conversaInicialRef.current
    if (!alvo || todas.length === 0) return
    if (todas.some((c) => c.id === alvo)) setSelectedId(alvo)
    conversaInicialRef.current = null
  }, [todas])
  const conversations = filtrarEOrdenar(tab === 'precisa_dono' ? aguardandoDono : todas, busca)
  const { messages, reload: reloadMessages } = useMessages(selectedId)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [contextPopup, setContextPopup] = useState<{ nome: string; resumo: string } | null>(null)

  /**
   * Rolagem da conversa.
   *
   * Abrir uma conversa no topo obriga o dono a rolar até embaixo toda vez para
   * ver a mensagem que acabou de chegar — que é justamente o motivo de ele ter
   * aberto. Vai para o fim, como qualquer aplicativo de mensagem.
   *
   * `perto` guarda se ele já estava no fim antes da atualização: sem isso,
   * mensagem nova chegando enquanto ele lê o histórico arrancaria a tela de
   * onde estava.
   */
  const threadRef = useRef<HTMLDivElement>(null)
  const pertoDoFim = useRef(true)

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    pertoDoFim.current = true
  }, [selectedId])

  useEffect(() => {
    const el = threadRef.current
    if (el && pertoDoFim.current) el.scrollTop = el.scrollHeight
  }, [messages])

  // Da lista COMPLETA, não da filtrada: digitar na busca algo que não casa com
  // a conversa aberta fazia a thread sumir e levava o rascunho junto.
  const selectedConversation = todas.find((c) => c.id === selectedId) ?? null
  const { contexto, loading: carregandoContexto } = useContatoContexto(
    salonId,
    selectedConversation?.contact_phone ?? null,
  )

  async function handleSelectConversation(id: string) {
    setSelectedId(id)

    // O resumo aparece uma vez por resumo, não uma vez por abertura.
    //
    // Antes o controle era um Set em memória, que morre a cada recarga da
    // página — então o popup voltava toda vez que o dono entrava na conversa,
    // repetindo algo que ele já tinha lido. Guardar o texto já visto resolve
    // sem perder o caso que importa: se o agente escalar de novo com um resumo
    // diferente, o popup reaparece, porque o texto mudou.
    const conversa = conversations.find((c) => c.id === id)
    if (conversa?.needs_human && conversa.resumo_contexto) {
      if (lerResumoVisto(id) !== conversa.resumo_contexto) {
        setContextPopup({
          nome: conversa.contact_name ?? formatarTelefone(conversa.contact_phone),
          resumo: conversa.resumo_contexto,
        })
      }
    }

    await supabase
      .from('whatsapp_conversations')
      .update({ last_opened_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !selectedId || sending) return

    setSending(true)
    setSendError(null)
    try {
      const { data, error: sendErr } = await supabase.functions.invoke('whatsapp', {
        body: { action: 'send', conversationId: selectedId, content, salonId },
      })
      if (sendErr || data?.error) {
        setSendError(data?.error ?? 'Não foi possível enviar a mensagem.')
        return
      }
      setDraft('')
      reloadMessages()
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      setSendError('Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  async function handleResumeAgent() {
    if (!selectedId || resuming) return
    setResuming(true)
    setResumeError(null)
    try {
      const { data, error: resumeErr } = await supabase.functions.invoke('whatsapp', {
        body: { action: 'resume_agent', conversationId: selectedId, salonId },
      })
      if (resumeErr || data?.error) {
        setResumeError(data?.error ?? 'Não foi possível devolver a conversa ao agente.')
        return
      }
      await reloadConversations()
    } catch (err) {
      console.error('Erro ao devolver conversa ao agente:', err)
      setResumeError('Não foi possível devolver a conversa ao agente.')
    } finally {
      setResuming(false)
    }
  }

  if (salonLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
  }

  if (!salonId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sua conta ainda não está vinculada a um salão.
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar com as duas opções centralizadas */}
      <header className="bg-surface border-b border-border px-4 py-3 flex items-center justify-center relative">
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1">
          <button
            onClick={() => {
              setTab('todas')
              setSelectedId(null)
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === 'todas' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Todas as conversas
          </button>
          <button
            onClick={() => {
              setTab('precisa_dono')
              setSelectedId(null)
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
              tab === 'precisa_dono' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <AlertCircle size={14} />
            Solicitou falar com o dono
            {/* O contador transforma "tem alguém esperando" em "três pessoas
                esperando" — e some quando não há ninguém, para não virar ruído. */}
            {aguardandoDono.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-semibold flex items-center justify-center">
                {aguardandoDono.length}
              </span>
            )}
          </button>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Lista de conversas */}
        {/* No celular só cabe um painel por vez: lista OU conversa. Sem este
            mestre-detalhe, a lista ocupava 100% da largura e a thread ficava
            com largura zero — o dono via as conversas mas nunca conseguia LER
            uma pelo celular. */}
        <aside
          className={`${selectedId ? 'hidden sm:block' : 'block'} w-full sm:w-80 shrink-0 border-r border-border bg-surface overflow-y-auto`}
        >
          {/* Depois de alguns meses a lista tem centenas de linhas e rolar
              deixa de ser opção. Busca client-side porque as conversas já estão
              todas carregadas. */}
          <div className="sticky top-0 z-10 bg-surface border-b border-border p-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full rounded-md border border-border bg-surface-2 pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger p-4">{error}</p>}

          {!loading && conversations.length === 0 && (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {busca.trim()
                ? 'Nenhuma conversa encontrada para essa busca.'
                : tab === 'precisa_dono'
                  ? 'Nenhuma conversa aguardando o dono.'
                  : 'Nenhuma conversa ainda.'}
            </p>
          )}

          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectConversation(c.id)}
              /* A conversa aberta ganha barra à esquerda, e não só um fundo:
                 o fundo sozinho era igual ao do hover, então passar o mouse
                 fazia parecer que a seleção tinha mudado. */
              className={`w-full text-left pr-4 py-3 border-b border-border flex items-start gap-3 border-l-2 transition-colors ${
                selectedId === c.id
                  ? 'bg-surface-2 border-l-primary pl-[14px]'
                  : 'border-l-transparent pl-[14px] hover:bg-surface-2'
              }`}
            >
              {/* Iniciais identificam a pessoa de relance; o balãozinho
                  genérico era igual para todo mundo. */}
              <div className="w-10 h-10 rounded-full bg-chat-avatar text-chat-avatar-foreground flex items-center justify-center shrink-0 text-xs font-semibold">
                {iniciais(c.contact_name)}
              </div>
              <div className="min-w-0 flex-1">
                {/*
                  Três níveis claros de peso, em vez de tudo com a mesma
                  importância: o nome guia o olho, a prévia decide se vale
                  abrir, e o horário é referência. Quando não lida, o nome
                  escurece e a prévia sai do cinza — é o contraste que faz a
                  linha "pular", não só o pontinho.
                */}
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm truncate ${
                      naoLida(c) ? 'font-semibold text-foreground' : 'font-normal text-foreground'
                    }`}
                  >
                    {c.contact_name ?? formatarTelefone(c.contact_phone)}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[11px] tabular-nums ${
                        naoLida(c) ? 'text-danger font-medium' : 'text-muted-foreground'
                      }`}
                    >
                      {formatTime(c.last_message_at)}
                    </span>
                    {naoLida(c) && <span className="w-2 h-2 rounded-full bg-danger" title="Não lida" />}
                  </span>
                </div>

                {/* A prévia é o que decide qual conversa abrir primeiro. Sem
                    ela, o dono precisava abrir uma por uma para saber do quê
                    se tratava. Cai no telefone quando ainda não há mensagem. */}
                <div
                  className={`text-xs truncate mt-0.5 ${
                    naoLida(c) ? 'text-foreground/80' : 'text-muted-foreground'
                  }`}
                >
                  {c.last_message_preview ?? formatarTelefone(c.contact_phone)}
                </div>

                {/* Etiquetas de estado. "Pediu você" existe porque na aba
                    "Todas" não havia como distinguir quem está esperando —
                    só trocando de aba, o que esconde justamente o urgente. */}
                {(c.needs_human || c.agent_paused) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {c.needs_human && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft text-danger px-1.5 py-0.5 text-[10px] font-semibold">
                        <AlertCircle size={10} />
                        Pediu você
                      </span>
                    )}
                    {c.agent_paused && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-border text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
                        <Bot size={10} />
                        Agente pausado
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </aside>

        {/* Thread da conversa selecionada */}
        <main className={`${selectedId ? 'flex' : 'hidden sm:flex'} flex-1 flex-col min-w-0`}>
          {!selectedConversation ? (
            /* É a primeira coisa que o dono vê ao abrir a aba. Uma frase solta
               no meio do vazio parecia tela quebrada. */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted-foreground">
                <MessageCircle size={24} />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Suas conversas do WhatsApp</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Escolha alguém na lista ao lado para ler e responder.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Só no celular: no desktop a lista está sempre visível ao
                      lado e "voltar" não significa nada. */}
                  <button
                    onClick={() => setSelectedId(null)}
                    aria-label="Voltar para a lista de conversas"
                    className="sm:hidden shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {selectedConversation.contact_name ?? formatarTelefone(selectedConversation.contact_phone)}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatarTelefone(selectedConversation.contact_phone)}</div>
                  </div>
                </div>

                {selectedConversation.resumo_contexto && (
                  <button
                    onClick={() =>
                      setContextPopup({
                        nome:
                          selectedConversation.contact_name ??
                          formatarTelefone(selectedConversation.contact_phone),
                        resumo: selectedConversation.resumo_contexto!,
                      })
                    }
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    <Sparkles size={13} />
                    Ver resumo
                  </button>
                )}

                {/*
                  Aparece sempre que o agente está fora — pausado porque você
                  respondeu, ou porque o cliente pediu o dono — e não só na aba
                  "Solicitou falar com o dono".

                  A condição anterior era `tab === 'precisa_dono' &&
                  needs_human`, e isso criava uma armadilha: `agent_paused` vira
                  true quando o dono responde por **qualquer** conversa, então
                  responder pela aba "Todas" silenciava o agente para aquele
                  cliente sem deixar nenhum caminho de volta. O cliente mandava
                  mensagem e ninguém respondia.
                */}
                {(selectedConversation.agent_paused || selectedConversation.needs_human) && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={handleResumeAgent}
                      disabled={resuming}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1.5 disabled:opacity-50"
                    >
                      <Bot size={14} />
                      {resuming ? 'Devolvendo...' : 'Devolver ao agente'}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedConversation.agent_paused
                        ? 'O agente não responde este cliente enquanto você estiver no comando.'
                        : 'O cliente pediu para falar com você.'}
                    </span>
                    {resumeError && <p className="text-xs text-danger">{resumeError}</p>}
                  </div>
                )}
              </div>

              <ContatoContextoBar contexto={contexto} loading={carregandoContexto} />

              <div
                ref={threadRef}
                onScroll={(e) => {
                  const el = e.currentTarget
                  // 80px de folga: quem está "quase" no fim continua sendo
                  // levado junto pela mensagem nova.
                  pertoDoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
                }}
                className="flex-1 overflow-y-auto px-4 py-4"
              >
                {/* Largura de leitura. Sem o limite, a bolha ia a 75% da área —
                    que numa tela larga passa de 700px e quebra a leitura: a
                    linha fica tão longa que o olho se perde ao voltar. */}
                <div className="max-w-2xl mx-auto">
                  {montarThread(messages).map((item) =>
                    item.tipo === 'dia' ? (
                      <div key={item.chave} className="flex justify-center my-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-[11px] font-medium text-muted-foreground">
                          {item.rotulo}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={item.chave}
                        className={`flex ${item.mensagem.direction === 'in' ? 'justify-start' : 'justify-end'} ${
                          item.ultimaDoBloco ? 'mb-2.5' : 'mb-0.5'
                        }`}
                      >
                        <div
                          className={`max-w-[75%] px-3 py-2 text-sm rounded-2xl ${
                            item.mensagem.direction === 'in'
                              ? 'bg-surface text-foreground border border-border'
                              : 'bg-chat-out text-chat-out-foreground'
                          } ${
                            // Canto "puxado" no fim do bloco, como num balão de
                            // fala: é o que agrupa visualmente sem precisar de
                            // linha divisória.
                            item.ultimaDoBloco
                              ? item.mensagem.direction === 'in'
                                ? 'rounded-bl-sm'
                                : 'rounded-br-sm'
                              : ''
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{item.mensagem.content}</p>

                          {/* Assinatura só no fim do bloco: repetir "Agente ·
                              15:27" em cada mensagem seguida era ruído. */}
                          {item.ultimaDoBloco && (
                            <div
                              className={`text-[10px] mt-1 ${
                                item.mensagem.direction === 'in'
                                  ? 'text-muted-foreground'
                                  : 'text-chat-out-muted'
                              }`}
                            >
                              {item.mensagem.sender === 'agente'
                                ? 'Agente · '
                                : item.mensagem.sender === 'dono'
                                  ? 'Você · '
                                  : ''}
                              {formatTime(item.mensagem.created_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <form onSubmit={handleSend} className="bg-surface border-t border-border p-3">
                {sendError && <p className="text-xs text-danger mb-2">{sendError}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend(e)
                      }
                    }}
                    placeholder="Digite uma mensagem"
                    rows={1}
                    className="flex-1 resize-none border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm max-h-32"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label="Enviar mensagem"
                    className="bg-chat-out text-chat-out-foreground rounded-full p-2.5 disabled:opacity-40 shrink-0 transition-opacity"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>

      {contextPopup && (
        <ContextPopup
          contactName={contextPopup.nome}
          resumo={contextPopup.resumo}
          onClose={() => {
            if (selectedId) marcarResumoVisto(selectedId, contextPopup.resumo)
            setContextPopup(null)
          }}
        />
      )}
    </div>
  )
}
