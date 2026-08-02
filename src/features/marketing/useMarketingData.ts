import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ClienteElegivel, HorarioOcioso, ResumoSegmento } from './types'
import type { SegmentoId } from './simulador'

type LinhaSegmento = {
  segmento: string
  clientes: number
  ticket_medio: number
  potencial: number
  ultima_campanha: string | null
}

type LinhaHorario = {
  dia_semana: number
  hora: number
  capacidade: number
  agendados_por_semana: number
  ocupacao: number
}

/**
 * Carrega os cards de oportunidade da aba Marketing.
 *
 * Tudo vem de RPC: a elegibilidade é decidida no banco, não aqui. O front não
 * deve conseguir montar um segmento que burla as travas (agendamento futuro,
 * opt-out, cooldown), porque o n8n vai usar as mesmas funções na hora do envio.
 */
export function useMarketingData(salonId: string | null) {
  const [segmentos, setSegmentos] = useState<ResumoSegmento[]>([])
  const [ociosos, setOciosos] = useState<HorarioOcioso[]>([])
  const [comissaoMedia, setComissaoMedia] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const [resumo, horarios, comissao] = await Promise.all([
      supabase.rpc('marketing_segmentos', { p_salon_id: salonId }),
      // Pede a grade inteira: a tela agrupa por dia da semana, e para isso
      // precisa enxergar todas as faixas, não as 5 piores (que costumam cair
      // todas no mesmo dia).
      supabase.rpc('marketing_horarios_ociosos', { p_salon_id: salonId, p_limite: 200 }),
      supabase.rpc('marketing_comissao_media', { p_salon_id: salonId }),
    ])

    if (resumo.error) {
      console.error('Erro ao carregar segmentos de marketing:', resumo.error)
      setError('Não foi possível carregar as oportunidades.')
      setLoading(false)
      return
    }

    setSegmentos(
      ((resumo.data ?? []) as LinhaSegmento[]).map((l) => ({
        segmento: l.segmento as SegmentoId,
        clientes: Number(l.clientes),
        ticketMedio: Number(l.ticket_medio),
        potencial: Number(l.potencial),
        ultimaCampanha: l.ultima_campanha,
      })),
    )

    // Horário ocioso e comissão são complementos: se falharem, a tela ainda
    // responde "vale a pena?" para os outros segmentos.
    if (horarios.error) {
      console.error('Erro ao carregar horários ociosos:', horarios.error)
      setOciosos([])
    } else {
      setOciosos(
        ((horarios.data ?? []) as LinhaHorario[]).map((l) => ({
          diaSemana: Number(l.dia_semana),
          hora: Number(l.hora),
          capacidade: Number(l.capacidade),
          agendadosPorSemana: Number(l.agendados_por_semana),
          ocupacao: Number(l.ocupacao),
        })),
      )
    }

    if (comissao.error) {
      console.error('Erro ao carregar comissão média:', comissao.error)
      setComissaoMedia(0)
    } else {
      setComissaoMedia(Number(comissao.data ?? 0))
    }

    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { segmentos, ociosos, comissaoMedia, loading, error, reload }
}

/**
 * Busca a lista de clientes de um segmento, sob demanda.
 *
 * Separado do resumo de propósito: o dono só precisa ver nomes quando abre um
 * segmento específico, e carregar todos de uma vez seria puxar a base inteira
 * para desenhar quatro cards.
 */
export function useClientesDoSegmento(salonId: string | null, segmento: SegmentoId | null) {
  const [clientes, setClientes] = useState<ClienteElegivel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!salonId || !segmento) {
      setClientes([])
      return
    }
    let cancelado = false
    setLoading(true)

    supabase
      .rpc('marketing_segmento_clientes', { p_salon_id: salonId, p_segmento: segmento })
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          console.error('Erro ao carregar clientes do segmento:', error)
          setClientes([])
        } else {
          setClientes(
            (data ?? []).map((l: Record<string, unknown>) => ({
              clientId: String(l.client_id),
              nome: String(l.nome),
              telefone: (l.telefone as string) ?? null,
              ultimoAtendimento: (l.ultimo_atendimento as string) ?? null,
              visitas: Number(l.visitas),
              ticketMedio: Number(l.ticket_medio),
            })),
          )
        }
        setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [salonId, segmento])

  return { clientes, loading }
}
