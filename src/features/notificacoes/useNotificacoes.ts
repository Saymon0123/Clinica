import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { contarNaoVistas, type Notificacao } from './notificacoes'

/**
 * O sino: a lista dos últimos 7 dias (view `notificacoes_do_salao`, 0173) e o
 * marco "vi até aqui" desta pessoa neste salão (`notificacoes_vistas`).
 *
 * A lista é DERIVADA de `appointments` — nada é gravado quando o evento
 * acontece, então não existe notificação órfã nem dessincronizada da agenda.
 * O realtime escuta a própria `appointments` (mesma fonte) e recarrega com um
 * fôlego de 2s, como o Catálogo faz com o estoque.
 */
export function useNotificacoes(salonId: string | null) {
  const { user } = useAuth()
  // O nome do canal leva um sufixo único por montagem: `supabase.channel()`
  // devolve o MESMO canal para o mesmo tópico, e um segundo assinante no
  // tópico já assinado derruba o app ("cannot add postgres_changes callbacks
  // after subscribe()" — Sentry REACT-NATIVE-7). O provider garante UMA
  // montagem; o sufixo garante que remontagem (StrictMode, troca de salão no
  // meio do teardown) nunca colida com um canal ainda vivo.
  const instancia = useId()
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [vistoEm, setVistoEm] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const carregar = useCallback(async () => {
    if (!salonId || !user) return
    setCarregando(true)
    const [lista, visto] = await Promise.all([
      supabase
        .from('notificacoes_do_salao')
        .select('chave, tipo, evento_em, data_hora_inicio, origem, cliente, barbeiro, servicos')
        .eq('salon_id', salonId)
        .order('evento_em', { ascending: false })
        .limit(50),
      supabase
        .from('notificacoes_vistas')
        .select('visto_em')
        .eq('salon_id', salonId)
        .maybeSingle(),
    ])
    if (lista.error || visto.error) {
      console.error('Erro ao carregar as notificações:', lista.error ?? visto.error)
      // A lista anterior fica: dado antigo com aviso é melhor que sino zerado
      // mentindo que não chegou nada (a mesma regra do achado 31).
      setErro(true)
      setCarregando(false)
      return
    }
    setErro(false)
    setNotificacoes((lista.data ?? []) as Notificacao[])
    setVistoEm((visto.data?.visto_em as string | undefined) ?? null)
    setCarregando(false)
  }, [salonId, user])

  useEffect(() => {
    carregar()
  }, [carregar])

  // A fonte é appointments: qualquer mudança lá pode virar (ou tirar) uma
  // notificação. Fôlego de 2s para uma rajada não virar N consultas.
  useEffect(() => {
    if (!salonId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const agendar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => carregar(), 2000)
    }
    const channel = supabase
      .channel(`notificacoes_${salonId}_${instancia}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        agendar,
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [salonId, carregar, instancia])

  /**
   * "Vi até aqui" — chamado ao ABRIR o painel. Grava agora e devolve o marco
   * ANTERIOR, para o painel ainda pintar o pontinho no que era novo.
   */
  const marcarVistas = useCallback(async (): Promise<string | null> => {
    const anterior = vistoEm
    if (!salonId || !user) return anterior
    const agora = new Date().toISOString()
    setVistoEm(agora) // otimista: o badge zera na hora
    const { error } = await supabase
      .from('notificacoes_vistas')
      .upsert(
        { user_id: user.id, salon_id: salonId, visto_em: agora },
        { onConflict: 'user_id,salon_id' },
      )
    if (error) {
      // Falhou em gravar: o badge volta no próximo carregamento — não é motivo
      // para interromper a leitura, mas fica no console para diagnóstico.
      console.error('Erro ao marcar notificações como vistas:', error)
    }
    return anterior
  }, [salonId, user, vistoEm])

  return {
    notificacoes,
    naoVistas: contarNaoVistas(notificacoes, vistoEm),
    carregando,
    erro,
    recarregar: carregar,
    marcarVistas,
  }
}
