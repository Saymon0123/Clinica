import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { MetricasDeFiltro } from './filtrosDeCampanha'

/**
 * As métricas de TODOS os clientes do salão, uma vez, para os filtros da
 * lista (RPC `metricas_para_filtros`, 0175 — definer: números iguais para
 * todo papel).
 *
 * Devolve `null` enquanto carrega E quando falha: os chips de filtro só
 * aparecem com o mapa na mão — chip clicável sobre dado ausente filtraria
 * para uma lista vazia MENTINDO que não há atrasados (a regra do achado 31,
 * de novo). O erro fica no console.
 */
export function useMetricasParaFiltros(salonId: string | null) {
  const [mapa, setMapa] = useState<Map<string, MetricasDeFiltro> | null>(null)

  useEffect(() => {
    if (!salonId) {
      setMapa(null)
      return
    }
    let cancelado = false
    setMapa(null)
    supabase
      .rpc('metricas_para_filtros', { p_salon_id: salonId })
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          console.error('Erro ao carregar métricas para filtros:', error)
          return
        }
        const linhas = (data ?? []) as MetricasDeFiltro[]
        setMapa(new Map(linhas.map((l) => [l.client_id, l])))
      })
    return () => {
      cancelado = true
    }
  }, [salonId])

  return mapa
}
