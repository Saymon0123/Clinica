import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type ContatoContexto = {
  clientId: string
  nome: string
  clienteDesde: string
  /** Último atendimento concluído. `null` para quem nunca veio. */
  ultimaVisita: string | null
  /** Próximo horário marcado. `null` quando não há. */
  proximoAgendamento: string | null
  totalVisitas: number
}

/**
 * Descobre quem é o contato do WhatsApp dentro do CRM.
 *
 * Sem isto, o dono abre uma conversa e vê um telefone. As perguntas que ele
 * realmente tem — é cliente meu? já veio? tem horário marcado? — exigiam sair
 * da tela e procurar na Agenda ou em Clientes, que é justamente o tempo que o
 * produto promete devolver.
 *
 * O casamento é por `telefone_norm` (últimos 8 dígitos), nunca pelo telefone
 * inteiro: o WhatsApp entrega `554187275895` e o cadastro guarda
 * `(41) 98727-5895`. Comparar por igualdade nunca casa — é a mesma regra que o
 * fluxo do n8n usa, documentada em docs/n8n-integration.md.
 *
 * Devolve `null` quando o número não está cadastrado. Isso não é erro: é o
 * contato novo, e saber que ele é novo também é informação útil.
 */
export function useContatoContexto(salonId: string | null, contactPhone: string | null) {
  const [contexto, setContexto] = useState<ContatoContexto | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!salonId || !contactPhone) {
      setContexto(null)
      return
    }

    const ultimos8 = contactPhone.replace(/\D/g, '').slice(-8)
    if (ultimos8.length < 8) {
      setContexto(null)
      return
    }

    let cancelado = false
    setLoading(true)

    async function carregar() {
      const { data: cliente, error } = await supabase
        .from('clients')
        .select('id, nome, created_at')
        .eq('salon_id', salonId)
        .eq('telefone_norm', ultimos8)
        .maybeSingle()

      if (cancelado) return
      if (error || !cliente) {
        if (error) console.error('Erro ao buscar o cliente do contato:', error)
        setContexto(null)
        setLoading(false)
        return
      }

      const agora = new Date().toISOString()
      const [concluidos, futuros] = await Promise.all([
        supabase
          .from('appointments')
          .select('data_hora_inicio', { count: 'exact' })
          .eq('client_id', cliente.id)
          .eq('status', 'concluido')
          .order('data_hora_inicio', { ascending: false })
          .limit(1),
        supabase
          .from('appointments')
          .select('data_hora_inicio')
          .eq('client_id', cliente.id)
          .neq('status', 'cancelado')
          .gt('data_hora_inicio', agora)
          .order('data_hora_inicio', { ascending: true })
          .limit(1),
      ])

      if (cancelado) return

      setContexto({
        clientId: cliente.id,
        nome: cliente.nome,
        clienteDesde: cliente.created_at,
        ultimaVisita: concluidos.data?.[0]?.data_hora_inicio ?? null,
        proximoAgendamento: futuros.data?.[0]?.data_hora_inicio ?? null,
        totalVisitas: concluidos.count ?? 0,
      })
      setLoading(false)
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [salonId, contactPhone])

  return { contexto, loading }
}
