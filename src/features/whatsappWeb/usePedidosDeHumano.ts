import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PedidoDeHumano = {
  id: string
  contact_name: string | null
  contact_phone: string
  resumo_contexto: string | null
  last_message_preview: string | null
  last_message_at: string | null
}

/**
 * As conversas em que o cliente pediu uma pessoa de verdade (needs_human),
 * para o alerta global do CRM. O caminho curto que o dono pediu: em vez de
 * e-mail ou template pago, o aviso aparece onde o barbeiro já está — com o
 * resumo do que o cliente quer e o atalho para responder.
 *
 * A notificação do navegador cobre o CRM em outra aba: com a permissão dada,
 * o pedido estoura na tela mesmo sem o app em foco.
 */
export function usePedidosDeHumano(salonId: string | null) {
  const [pedidos, setPedidos] = useState<PedidoDeHumano[]>([])
  // Ids já vistos nesta sessão: notifica só o pedido NOVO, não a lista inteira
  // a cada recarga.
  const vistosRef = useRef<Set<string> | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('id, contact_name, contact_phone, resumo_contexto, last_message_preview, last_message_at')
      .eq('salon_id', salonId)
      .eq('needs_human', true)
      .order('last_message_at', { ascending: false })

    if (error) {
      console.error('Erro ao carregar pedidos de atendimento humano:', error)
      return
    }

    const lista = (data ?? []) as PedidoDeHumano[]

    if (vistosRef.current === null) {
      // Primeira carga: o que já estava pendente não vira notificação — o
      // banner na tela basta; notificar o backlog assustaria à toa.
      vistosRef.current = new Set(lista.map((p) => p.id))
    } else {
      for (const p of lista) {
        if (vistosRef.current.has(p.id)) continue
        vistosRef.current.add(p.id)
        notificar(p)
      }
    }

    setPedidos(lista)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!salonId) return
    const channel = supabase
      .channel(`pedidos_humano_${salonId}`)
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

  const resolver = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ needs_human: false })
        .eq('id', id)
      if (error) {
        console.error('Erro ao resolver o pedido:', error)
        return false
      }
      await reload()
      return true
    },
    [reload],
  )

  return { pedidos, resolver }
}

function notificar(p: PedidoDeHumano) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    // Pede a permissão na primeira vez que há motivo real — nunca no load.
    Notification.requestPermission().then((r) => {
      if (r === 'granted') notificar(p)
    })
    return
  }
  if (Notification.permission !== 'granted') return
  const n = new Notification(`${p.contact_name ?? p.contact_phone} quer falar com você`, {
    body: p.resumo_contexto ?? p.last_message_preview ?? 'Abra a conversa para responder.',
    tag: `pedido-humano-${p.id}`,
  })
  n.onclick = () => {
    window.focus()
    window.open(`/web?conversa=${p.id}`, '_blank', 'noopener,noreferrer')
  }
}
