import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ServiceItem } from './types'

export function useServicesData(salonId: string | null) {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const inicioDoMes = new Date()
    inicioDoMes.setDate(1)
    inicioDoMes.setHours(0, 0, 0, 0)

    const [{ data, error: fetchError }, vendasResult] = await Promise.all([
      supabase
        .from('services')
        .select('id, nome, duracao_minutos, preco, ativo, created_by')
        .eq('salon_id', salonId)
        .order('nome'),
      supabase
        .from('order_items')
        .select('service_id, orders!inner(salon_id, status, closed_at)')
        .eq('orders.salon_id', salonId)
        .eq('orders.status', 'fechada')
        .eq('tipo', 'servico')
        .gte('orders.closed_at', inicioDoMes.toISOString()),
    ])

    if (fetchError) {
      console.error('Erro ao carregar serviços:', fetchError)
      setError('Não foi possível carregar os serviços.')
      setLoading(false)
      return
    }

    // Contagem de vendas falhou? A lista de serviços ainda vale — mas com
    // aviso no console, não com zeros que parecem verdade.
    if (vendasResult.error) console.error('Erro ao contar vendas do mês:', vendasResult.error)

    const vendasPorServico = new Map<string, number>()
    for (const item of vendasResult.data ?? []) {
      if (!item.service_id) continue
      vendasPorServico.set(item.service_id, (vendasPorServico.get(item.service_id) ?? 0) + 1)
    }

    // O mais vendido em cima: a lista alfabética escondia o carro-chefe no
    // meio. Empate (e mês começando) cai no alfabeto.
    const lista: ServiceItem[] = (data ?? []).map((s) => ({
      ...s,
      vendas_mes: vendasPorServico.get(s.id) ?? 0,
    }))
    lista.sort((a, b) => b.vendas_mes - a.vendas_mes || a.nome.localeCompare(b.nome))

    setServices(lista)
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { services, loading, error, reload }
}
