import { describe, expect, it } from 'vitest'
import {
  passaNoFiltro,
  type MetricasDeFiltro,
} from './filtrosDeCampanha'

/**
 * Filtros de campanha em lote. O que se prende:
 *   · "atrasados" usa a MESMA régua da ficha (ritmo próprio), não um número
 *     fixo — lista e ficha nunca podem discordar;
 *   · "pacote vencendo" exige saldo E janela (vencido já nem chega aqui);
 *   · "nunca levou produto" só mira quem JÁ tem comanda fechada;
 *   · cliente sem linha de métrica não passa em filtro nenhum além de todos.
 */

function m(parte: Partial<MetricasDeFiltro>): MetricasDeFiltro {
  return {
    client_id: 'c1',
    dias_desde_ultima: null,
    intervalo_mediano_dias: null,
    comprou_produto: false,
    fechadas: 0,
    pacote_restante: 0,
    pacote_vence_em_dias: null,
    ...parte,
  }
}

describe('passaNoFiltro', () => {
  it('todos deixa passar ate quem nao tem metrica', () => {
    expect(passaNoFiltro('todos', undefined)).toBe(true)
  })

  it('sem linha de metrica, nenhum outro filtro passa', () => {
    expect(passaNoFiltro('atrasados', undefined)).toBe(false)
    expect(passaNoFiltro('pacote_vencendo', undefined)).toBe(false)
    expect(passaNoFiltro('sem_produto', undefined)).toBe(false)
  })

  it('atrasado e a regua da ficha: alem do ritmo proprio', () => {
    expect(passaNoFiltro('atrasados', m({ dias_desde_ultima: 25, intervalo_mediano_dias: 15 }))).toBe(true)
    expect(passaNoFiltro('atrasados', m({ dias_desde_ultima: 10, intervalo_mediano_dias: 15 }))).toBe(false)
    // Sem ritmo (1 visita so), nao ha regua -- nao e "atrasado", e desconhecido.
    expect(passaNoFiltro('atrasados', m({ dias_desde_ultima: 90 }))).toBe(false)
  })

  it('pacote vencendo exige saldo e janela de 30 dias', () => {
    expect(passaNoFiltro('pacote_vencendo', m({ pacote_restante: 3, pacote_vence_em_dias: 10 }))).toBe(true)
    expect(passaNoFiltro('pacote_vencendo', m({ pacote_restante: 3, pacote_vence_em_dias: 45 }))).toBe(false)
    expect(passaNoFiltro('pacote_vencendo', m({ pacote_restante: 0, pacote_vence_em_dias: 10 }))).toBe(false)
    expect(passaNoFiltro('pacote_vencendo', m({ pacote_restante: 3 }))).toBe(false)
  })

  it('nunca levou produto so mira quem ja tem comanda', () => {
    expect(passaNoFiltro('sem_produto', m({ fechadas: 2, comprou_produto: false }))).toBe(true)
    expect(passaNoFiltro('sem_produto', m({ fechadas: 2, comprou_produto: true }))).toBe(false)
    expect(passaNoFiltro('sem_produto', m({ fechadas: 0, comprou_produto: false }))).toBe(false)
  })
})
