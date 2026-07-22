import { useState, type FormEvent } from 'react'
import { AlertCircle, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useConversations } from './useConversations'
import { useMessages } from './useMessages'

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

  const { conversations, loading, error } = useConversations(salonId, tab === 'precisa_dono')
  const { messages, reload: reloadMessages } = useMessages(selectedId)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null

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

  if (salonLoading) {
    return <div className="p-6 text-sm text-gray-500">Carregando...</div>
  }

  if (!salonId) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Sua conta ainda não está vinculada a um salão.
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar com as duas opções centralizadas */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center relative">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => {
              setTab('todas')
              setSelectedId(null)
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === 'todas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
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
              tab === 'precisa_dono' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <AlertCircle size={14} />
            Solicitou falar com o dono
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Lista de conversas */}
        <aside className="w-full sm:w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          {error && <p className="text-sm text-red-600 p-4">{error}</p>}

          {!loading && conversations.length === 0 && (
            <p className="text-sm text-gray-400 p-6 text-center">
              {tab === 'precisa_dono' ? 'Nenhuma conversa aguardando o dono.' : 'Nenhuma conversa ainda.'}
            </p>
          )}

          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 flex items-start gap-3 hover:bg-gray-50 ${
                selectedId === c.id ? 'bg-gray-100' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {c.contact_name ?? formatPhone(c.contact_phone)}
                  </span>
                  {c.needs_human && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Precisa do dono" />
                  )}
                </div>
                <div className="text-xs text-gray-400 truncate">{formatPhone(c.contact_phone)}</div>
                <div className="text-xs text-gray-400">{formatTime(c.last_message_at)}</div>
              </div>
            </button>
          ))}
        </aside>

        {/* Thread da conversa selecionada */}
        <main className="flex-1 flex flex-col min-w-0">
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Selecione uma conversa para visualizar
            </div>
          ) : (
            <>
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="text-sm font-medium text-gray-900">
                  {selectedConversation.contact_name ?? formatPhone(selectedConversation.contact_phone)}
                </div>
                <div className="text-xs text-gray-400">{formatPhone(selectedConversation.contact_phone)}</div>
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
                          ? 'bg-white text-gray-900 border border-gray-200'
                          : 'bg-green-600 text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div
                        className={`text-[10px] mt-1 ${m.direction === 'in' ? 'text-gray-400' : 'text-green-100'}`}
                      >
                        {m.sender === 'agente' ? 'Agente · ' : m.sender === 'dono' ? 'Você · ' : ''}
                        {formatTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="bg-white border-t border-gray-200 p-3">
                {sendError && <p className="text-xs text-red-600 mb-2">{sendError}</p>}
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
                    className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm max-h-32"
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
