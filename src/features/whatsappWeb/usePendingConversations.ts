import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playMessageSound } from '../../lib/sound'

export function usePendingConversations(salonId: string | null) {
  const [hasPending, setHasPending] = useState(false)
  const prevCountRef = useRef(0)

  const reload = useCallback(async () => {
    if (!salonId) return

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('last_message_at, last_opened_at')
      .eq('salon_id', salonId)
      .eq('needs_human', true)

    if (error) {
      console.error('Erro ao checar conversas pendentes:', error)
      return
    }

    const pending = (data ?? []).filter(
      (c) => !c.last_opened_at || (c.last_message_at && c.last_message_at > c.last_opened_at),
    )

    if (pending.length > prevCountRef.current) {
      playMessageSound()
    }
    prevCountRef.current = pending.length
    setHasPending(pending.length > 0)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!salonId) return

    const channel = supabase
      .channel(`whatsapp_pending_${salonId}`)
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

  return { hasPending }
}
