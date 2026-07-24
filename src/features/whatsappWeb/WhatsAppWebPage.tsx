import { useState, type FormEvent } from 'react'
import { AlertCircle, Bot, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useConversations } from './useConversations'
import { useMessages } from './useMessages'
import { ThemeToggle } from '../../components/ThemeToggle'

type Tab = 'todas' | 'precisa_dono'

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone
  const country = digits.slice(0, digits.length - 11)
  const ddd = digits.slice(-11, -9)
  const rest = digits.slice(-9)
  return `${country ? `+${country} ` : ''}(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function WhatsAppWebPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [tab, setTab] = useState<Tab>('todas')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { conversations, loading, error, reload: reloadConversations } = useConversations(salonId, tab === 'precisa_dono')
  const { messages, reload: reloadMessages } = useMessages(selectedId)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null

  function isUnread(c: { last_message_at: string | null; last_opened_at: string | null }) {
    if (!c.last_message_at) return false
    return !c.last_opened_at || c.last_message_at > c.last_opened_at
  }

  async function handleSelectConversation(id: string) {
    setSelectedId(id)
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
        body: { action: 'send', conversationId: selectedId, content },
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
        body: { action: 'resume_agent', conversationId: selectedId },
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
          </button>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Lista de conversas */}
        <aside className="w-full sm:w-80 shrink-0 border-r border-border bg-surface overflow-y-auto">
          {error && <p className="text-sm text-danger p-4">{error}</p>}

          {!loading && conversations.length === 0 && (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {tab === 'precisa_dono' ? 'Nenhuma conversa aguardando o dono.' : 'Nenhuma conversa ainda.'}
            </p>
          )}

          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectConversation(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-border flex items-start gap-3 hover:bg-surface-2 ${
                selectedId === c.id ? 'bg-surface-2' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${isUnread(c) ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                    {c.contact_name ?? formatPhone(c.contact_phone)}
                  </span>
                  {isUnread(c) && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Não lida" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{formatPhone(c.contact_phone)}</div>
                <div className="text-xs text-muted-foreground">{formatTime(c.last_message_at)}</div>
              </div>
            </button>
          ))}
        </aside>

        {/* Thread da conversa selecionada */}
        <main className="flex-1 flex flex-col min-w-0">
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa para visualizar
            </div>
          ) : (
            <>
              <div className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {selectedConversation.contact_name ?? formatPhone(selectedConversation.contact_phone)}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatPhone(selectedConversation.contact_phone)}</div>
                </div>

                {tab === 'precisa_dono' && selectedConversation.needs_human && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={handleResumeAgent}
                      disabled={resuming}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1.5 disabled:opacity-50"
                    >
                      <Bot size={14} />
                      {resuming ? 'Devolvendo...' : 'Devolver ao agente'}
                    </button>
                    {resumeError && <p className="text-xs text-danger">{resumeError}</p>}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === 'in' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'in'
                          ? 'bg-surface text-foreground border border-border'
                          : 'bg-green-600 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div
                        className={`text-[10px] mt-1 ${m.direction === 'in' ? 'text-muted-foreground' : 'text-green-100'}`}
                      >
                        {m.sender === 'agente' ? 'Agente · ' : m.sender === 'dono' ? 'Você · ' : ''}
                        {formatTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
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
                    className="bg-green-600 text-white rounded-full p-2.5 disabled:opacity-40 shrink-0"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
