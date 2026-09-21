import { situacaoDoCiclo } from './metricasDoCliente'

/**
 * Os filtros de campanha da lista de Clientes (RPC `metricas_para_filtros`,
 * 0175) — onde as métricas da ficha viram LOTE: "todos os atrasados",
 * "pacote vencendo", "nunca levou produto".
 *
 * Cada filtro é a mesma régua da ficha (o "atrasado" daqui é o
 * `situacaoDoCiclo` de lá), senão a lista diria uma coisa e a ficha outra.
 * Cliente SEM linha de métrica não passa em filtro nenhum além de "todos" —
 * filtro sem dado não inventa alvo de campanha.
 */

export type MetricasDeFiltro = {
  client_id: string
  dias_desde_ultima: number | null
  intervalo_mediano_dias: number | null
  comprou_produto: boolean
  fechadas: number
  pacote_restante: number
  pacote_vence_em_dias: number | null
}

export type FiltroDeCampanha = 'todos' | 'atrasados' | 'pacote_vencendo' | 'sem_produto'

/** Janela do "pacote vencendo": renovação se conversa com um mês de folga. */
export const PACOTE_VENCENDO_DIAS = 30

export const ROTULOS_DOS_FILTROS: Record<FiltroDeCampanha, string> = {
  todos: 'Todos',
  atrasados: 'Atrasados',
  pacote_vencendo: 'Pacote vencendo',
  sem_produto: 'Nunca levou produto',
}

export function passaNoFiltro(
  filtro: FiltroDeCampanha,
  m: MetricasDeFiltro | undefined,
): boolean {
  if (filtro === 'todos') return true
  if (!m) return false
  switch (filtro) {
    case 'atrasados':
      return (
        situacaoDoCiclo(m.dias_desde_ultima, m.intervalo_mediano_dias)?.tipo === 'atrasado'
      )
    case 'pacote_vencendo':
      return (
        m.pacote_restante > 0 &&
        m.pacote_vence_em_dias != null &&
        m.pacote_vence_em_dias >= 0 &&
        m.pacote_vence_em_dias <= PACOTE_VENCENDO_DIAS
      )
    case 'sem_produto':
      // Só quem JÁ é cliente de verdade (tem comanda fechada): cadastro
      // recém-criado sem consumo nenhum não é alvo de campanha de pomada.
      return m.fechadas > 0 && !m.comprou_produto
  }
}
