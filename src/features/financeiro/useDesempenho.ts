import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { computePeriods, dayKey, type PeriodFilter } from './computePeriods'
import { DESEMPENHO_VAZIO, type Desempenho } from './taxas'

/** A linha que a RPC `desempenho_do_periodo` (0183) devolve, crua. */
type LinhaDaRpc = {
  minutos_jornada: number | string
  minutos_ocupados: number | string
  atendimentos: number
  servicos: number
  clientes: number
  clientes_que_voltaram: number
}

// `numeric` do Postgres chega como STRING no supabase-js, para não perder
// precisão. Somar isso direto concatenaria texto; dividir daria NaN calado.
function paraDesempenho(linha: LinhaDaRpc | undefined): Desempenho {
  if (!linha) return DESEMPENHO_VAZIO
  return {
    minutosJornada: Number(linha.minutos_jornada) || 0,
    minutosOcupados: Number(linha.minutos_ocupados) || 0,
    atendimentos: linha.atendimentos ?? 0,
    servicos: linha.servicos ?? 0,
    clientes: linha.clientes ?? 0,
    clientesQueVoltaram: linha.clientes_que_voltaram ?? 0,
  }
}

/**
 * As três taxas do barbeiro, no período escolhido e no anterior.
 *
 * Duas chamadas à mesma RPC em vez de uma que devolve os dois períodos: a
 * comparação é opcional na tela (barbearia no primeiro mês não tem com que
 * comparar), e uma consulta que falha sozinha deixa a outra de pé.
 *
 * O ESCOPO É DECIDIDO NO BANCO, não aqui: a RPC devolve o salão inteiro para o
 * gestor e só a própria cadeira para o barbeiro. Esta tela não passa
 * `p_professional_id` -- se passasse, seria uma régua repetida, e régua
 * repetida é régua que diverge.
 */
export function useDesempenho(
  salonId: string | null,
  filter: PeriodFilter,
  refMonth: string,
  refDia?: string,
) {
  const [atual, setAtual] = useState<Desempenho>(DESEMPENHO_VAZIO)
  const [anterior, setAnterior] = useState<Desempenho | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pedidoRef = useRef(0)

  const carregar = useCallback(async () => {
    if (!salonId) return
    const meuPedido = ++pedidoRef.current
    setLoading(true)

    const { currentStart, currentEnd, prevStart, prevEnd } = computePeriods(filter, refMonth, refDia)

    const [agora, antes] = await Promise.all([
      supabase.rpc('desempenho_do_periodo', {
        p_salon_id: salonId,
        p_de: dayKey(currentStart),
        p_ate: dayKey(currentEnd),
      }),
      supabase.rpc('desempenho_do_periodo', {
        p_salon_id: salonId,
        p_de: dayKey(prevStart),
        p_ate: dayKey(prevEnd),
      }),
    ])

    // Uma carga mais nova já foi pedida: esta resposta é velha e não escreve.
    if (meuPedido !== pedidoRef.current) return

    if (agora.error) {
      console.error('Erro ao carregar o desempenho do período:', agora.error)
      setError('Não foi possível carregar as taxas do período.')
      setLoading(false)
      return
    }

    setAtual(paraDesempenho((agora.data as LinhaDaRpc[] | null)?.[0]))
    // O período anterior é apoio: se ele falhar, a tela some com a comparação
    // e mostra o resto. Derrubar o número de hoje por causa do mês passado
    // seria trocar uma informação boa por nenhuma.
    setAnterior(antes.error ? null : paraDesempenho((antes.data as LinhaDaRpc[] | null)?.[0]))
    setError(null)
    setLoading(false)
  }, [salonId, filter, refMonth, refDia])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return { atual, anterior, loading, error, reload: carregar }
}
