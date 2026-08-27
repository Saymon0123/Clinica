import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PacoteItem = { service_id: string; quantidade: number; servico: string; preco_avulso: number }

export type Pacote = {
  id: string
  nome: string
  preco: number
  validade_dias: number | null
  ativo: boolean
  itens: PacoteItem[]
  /** Soma dos preços avulsos — para a tela mostrar a economia que o dono dá. */
  valor_avulso: number
  vendidos_mes: number
}

export function usePacotesData(salonId: string | null) {
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

    const inicioDoMes = new Date()
    inicioDoMes.setDate(1)
    inicioDoMes.setHours(0, 0, 0, 0)

    const [pacotesRes, vendasRes] = await Promise.all([
      supabase
        .from('pacotes')
        .select('id, nome, preco, validade_dias, ativo, pacote_itens(service_id, quantidade, services(nome, preco))')
        .eq('salon_id', salonId)
        .order('nome'),
      supabase
        .from('pacotes_do_cliente')
        .select('pacote_id')
        .eq('salon_id', salonId)
        .gte('comprado_em', inicioDoMes.toISOString()),
    ])

    if (pacotesRes.error) {
      console.error('Erro ao carregar pacotes:', pacotesRes.error)
      setError('Não foi possível carregar os pacotes.')
      setLoading(false)
      return
    }
    if (vendasRes.error) console.error('Erro ao contar vendas de pacotes:', vendasRes.error)

    const vendidos = new Map<string, number>()
    for (const v of vendasRes.data ?? []) {
      vendidos.set(v.pacote_id, (vendidos.get(v.pacote_id) ?? 0) + 1)
    }

    type LinhaServico = { nome?: string; preco?: number }
    type Linha = {
      id: string
      nome: string
      preco: number
      validade_dias: number | null
      ativo: boolean
      pacote_itens: { service_id: string; quantidade: number; services: LinhaServico | LinhaServico[] | null }[]
    }

    setPacotes(
      ((pacotesRes.data ?? []) as unknown as Linha[]).map((p) => {
        const itens: PacoteItem[] = (p.pacote_itens ?? []).map((i) => {
          const svc = Array.isArray(i.services) ? i.services[0] : i.services
          return {
            service_id: i.service_id,
            quantidade: i.quantidade,
            servico: svc?.nome ?? 'Serviço',
            preco_avulso: Number(svc?.preco ?? 0),
          }
        })
        return {
          id: p.id,
          nome: p.nome,
          preco: Number(p.preco),
          validade_dias: p.validade_dias,
          ativo: p.ativo,
          itens,
          valor_avulso: itens.reduce((s, i) => s + i.preco_avulso * i.quantidade, 0),
          vendidos_mes: vendidos.get(p.id) ?? 0,
        }
      }),
    )
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { pacotes, loading, error, reload }
}
