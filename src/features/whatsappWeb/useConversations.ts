import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Conversation } from './types'

export function useConversations(salonId: string | null, onlyNeedsHuman: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('whatsapp_conversations')
      .select('id, contact_phone, contact_name, last_message_at, last_opened_at, needs_human, agent_paused')
      .eq('salon_id', salonId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (onlyNeedsHuman) {
      query = query.eq('needs_human', true)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('Erro ao carregar conversas:', fetchError)
      setError('Não foi possível carregar as conversas.')
      setLoading(false)
      return
    }

    setConversations(data ?? [])
    setLoading(false)
  }, [salonId, onlyNeedsHuman])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!salonId) return

    const channel = supabase
      .channel(`whatsapp_conversations_${salonId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `salon_id=eq.${salonId}` },
        () => reload(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [salonId, reload])

  return { conversations, loading, error, reload }
}
