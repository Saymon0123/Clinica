import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Conversation } from './types'

/**
 * Carrega **todas** as conversas do salão; quem separa por aba é a tela.
 *
 * Antes o filtro de "solicitou falar com o dono" ia no servidor, e trocar de
 * aba refazia a consulta. Trazer tudo de uma vez torna a troca instantânea e,
 * principalmente, permite **contar** quantas aguardam o dono enquanto a aba
 * "todas" está aberta — que é a informação que faltava na tela.
 *
 * Cabe no volume atual (dezenas por salão). Se um dia passar de alguns
 * milhares, isto vira paginação com um contador separado.
 */
export function useConversations(salonId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('whatsapp_conversations')
      .select(
        'id, contact_phone, contact_name, last_message_at, last_opened_at, needs_human, agent_paused, resumo_contexto, last_message_preview',
      )
      .eq('salon_id', salonId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Erro ao carregar conversas:', fetchError)
      setError('Não foi possível carregar as conversas.')
      setLoading(false)
      return
    }

    setConversations(data ?? [])
    setLoading(false)
  }, [salonId])

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
