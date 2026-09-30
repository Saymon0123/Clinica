import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { computePeriods, dayKey, type PeriodFilter } from './computePeriods'
import { COMPOSICAO_VAZIA, type Composicao } from './taxas'

type LinhaDaRpc = {
  faturamento: number | string
  comandas: number
  vendido_total: number | string
  vendido_servico: number | string
  vendido_produto: number | string
  vendido_pacote: number | string
  melhor_dia: number | null
  melhor_dia_faturamento: number | string | null
  melhor_dia_comandas: number | null
}

// `numeric` do Postgres chega como STRING no supabase-js, para não perder
// precisão. Dividir isso direto daria NaN calado.
function paraComposicao(linha: LinhaDaRpc | undefined): Composicao {
  if (!linha) return COMPOSICAO_VAZIA
  return {
    faturamento: Number(linha.faturamento) || 0,
    comandas: linha.comandas ?? 0,
    vendidoTotal: Number(linha.vendido_total) || 0,
    vendidoServico: Number(linha.vendido_servico) || 0,
    vendidoProduto: Number(linha.vendido_produto) || 0,
    vendidoPacote: Number(linha.vendido_pacote) || 0,
    melhorDia: linha.melhor_dia ?? null,
    melhorDiaFaturamento: Number(linha.melhor_dia_faturamento) || 0,
    melhorDiaComandas: linha.melhor_dia_comandas ?? 0,
  }
}

/**
 * De onde vem o dinheiro, no período escolhido (migration 0184).
 *
 * **Só de gestão.** A RPC recusa o barbeiro com 42501, e `ativo` existe para
 * que a tela nem chegue a pedir: disparar uma chamada que se sabe que vai
 * falhar suja o console dele com um erro que não é problema dele.
 *
 * Não busca o período anterior. Ticket médio e composição já se comparam bem
 * pelo seletor de período, e a terceira caixa é um dia da semana — "antes era
 * terça" não diz nada útil.
 */
export function useComposicao(
  salonId: string | null,
  filter: PeriodFilter,
  refMonth: string,
  refDia: string | undefined,
  ativo: boolean,
) {
  const [dados, setDados] = useState<Composicao>(COMPOSICAO_VAZIA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pedidoRef = useRef(0)

  const carregar = useCallback(async () => {
    if (!salonId || !ativo) {
      setLoading(false)
      return
    }
    const meuPedido = ++pedidoRef.current
    setLoading(true)

    const { currentStart, currentEnd } = computePeriods(filter, refMonth, refDia)
    const { data, error: rpcError } = await supabase.rpc('composicao_do_periodo', {
      p_salon_id: salonId,
      p_de: dayKey(currentStart),
      p_ate: dayKey(currentEnd),
    })

    // Uma carga mais nova já foi pedida: esta resposta é velha e não escreve.
    if (meuPedido !== pedidoRef.current) return

    if (rpcError) {
      console.error('Erro ao carregar a composição do período:', rpcError)
      setError('Não foi possível carregar a composição do faturamento.')
      setLoading(false)
      return
    }

    setDados(paraComposicao((data as LinhaDaRpc[] | null)?.[0]))
    setError(null)
    setLoading(false)
  }, [salonId, filter, refMonth, refDia, ativo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return { dados, loading, error, reload: carregar }
}
