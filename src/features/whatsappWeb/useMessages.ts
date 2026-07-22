import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Message } from './types'

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoading(true)

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('id, conversation_id, direction, sender, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at')

    if (error) {
      console.error('Erro ao carregar mensagens:', error)
      setLoading(false)
      return
    }

    setMessages(data ?? [])
    setLoading(false)
  }, [conversationId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`whatsapp_messages_${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${conversationId}` },
        () => reload(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, reload])

  return { messages, loading }
}
