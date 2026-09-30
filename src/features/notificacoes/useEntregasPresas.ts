import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Quantos e-mails deste salão estão presos na fila (migration 0181).
 *
 * POR QUE ISTO EXISTE. Em 20/09 a caixa de e-mail da plataforma parou de
 * autenticar e ficou **quatro dias** em silêncio: os nós do n8n têm saída de
 * erro, então cada execução fechava como "sucesso". O alarme natural seria um
 * e-mail — e um aviso de "os e-mails não estão saindo" enviado por e-mail só
 * chega quando já não é preciso. Então ele vem para a tela, que é onde o dono
 * olha todo dia e não depende de terceiro nenhum.
 *
 * ERRO FICA MUDO (achado 31): isto é apoio, não conteúdo. Se a consulta falhar,
 * `null` mantém a faixa fora da tela em vez de acusar um problema que talvez
 * não exista — anunciar "seus e-mails não saíram" por causa de uma rede instável
 * seria pior que o silêncio.
 */

export type EntregasPresas = {
  presas: number
  convites: number
  feedbacks: number
  /** ISO do item mais antigo da fila — o "desde quando". */
  desde: string | null
}

/** De quanto em quanto tempo reconsultar. A fila anda em ciclos de 5 e 10
 *  minutos; 5 é frequente o bastante para a faixa sumir logo que normalizar. */
const INTERVALO_MS = 5 * 60 * 1000

export function useEntregasPresas(salonId: string | null) {
  const [dados, setDados] = useState<EntregasPresas | null>(null)

  useEffect(() => {
    if (!salonId) {
      setDados(null)
      return
    }
    let cancelado = false

    async function consultar() {
      const { data, error } = await supabase.rpc('entregas_presas', { p_salon_id: salonId })
      if (cancelado) return
      if (error) {
        // Mudo de propósito: ver a causa no console, nunca na cara do dono.
        console.error('Erro ao consultar entregas presas:', error)
        setDados(null)
        return
      }
      setDados((data as EntregasPresas | null) ?? null)
    }

    consultar()
    const id = setInterval(consultar, INTERVALO_MS)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [salonId])

  return dados
}
