import { describe, expect, it } from 'vitest'
import { sugerirTrocas, type SaldoUsavel } from './sugestaoDePacote'
import type { SaleItemDraft } from './types'

/**
 * A cutucada do caixa (parte C): a comanda cobra um serviço que o pacote do
 * cliente já pagou. O que se prende aqui:
 *   · linha cobrada que casa com saldo disponível gera sugestão;
 *   · consumo já na comanda NÃO gera (senão a cutucada viraria ruído);
 *   · a disponibilidade desconta consumos da própria comanda — a mesma conta
 *     do botão "Usar 1 do pacote", senão a sugestão mandaria o barbeiro
 *     direto para a trava de erro;
 *   · duas linhas cobradas do mesmo serviço com 1 crédito = UMA sugestão;
 *   · produto e pacote nunca são sugeridos.
 */

function item(parte: Partial<SaleItemDraft>): SaleItemDraft {
  return {
    chave: 'linha-1',
    tipo: 'servico',
    refId: 'svc-corte',
    nome: 'Corte masculino',
    quantidade: 1,
    preco_unitario: 45,
    ...parte,
  }
}

function saldo(parte: Partial<SaldoUsavel>): SaldoUsavel {
  return {
    pacote_do_cliente_id: 'pdc-1',
    service_id: 'svc-corte',
    servico: 'Corte masculino',
    restante: 3,
    ...parte,
  }
}

describe('sugerirTrocas', () => {
  it('linha cobrada que casa com saldo vira sugestao', () => {
    const s = sugerirTrocas([item({})], [saldo({})])
    expect(s).toHaveLength(1)
    expect(s[0].chaveDoItem).toBe('linha-1')
    expect(s[0].saldo.pacote_do_cliente_id).toBe('pdc-1')
  })

  it('consumo ja marcado (viaPacote) nao gera sugestao', () => {
    const linhas = [item({ preco_unitario: 0, viaPacote: 'pdc-1' })]
    expect(sugerirTrocas(linhas, [saldo({})])).toHaveLength(0)
  })

  it('consumo de pacote comprado NESTA comanda (viaPacoteNovo) tambem nao', () => {
    const linhas = [item({ preco_unitario: 0, viaPacoteNovo: 'uid-1' })]
    expect(sugerirTrocas(linhas, [saldo({})])).toHaveLength(0)
  })

  it('a disponibilidade desconta consumos da propria comanda', () => {
    // Saldo 1; a comanda ja tem 1 consumo desse pacote → nada sobra para sugerir.
    const linhas = [
      item({ chave: 'consumo', preco_unitario: 0, viaPacote: 'pdc-1' }),
      item({ chave: 'cobrada' }),
    ]
    expect(sugerirTrocas(linhas, [saldo({ restante: 1 })])).toHaveLength(0)
  })

  it('duas linhas cobradas do mesmo servico com 1 credito = UMA sugestao', () => {
    const linhas = [item({ chave: 'a' }), item({ chave: 'b' })]
    const s = sugerirTrocas(linhas, [saldo({ restante: 1 })])
    expect(s.map((x) => x.chaveDoItem)).toEqual(['a'])
  })

  it('servico de outro id, produto e pacote ficam de fora', () => {
    const linhas = [
      item({ chave: 'outra', refId: 'svc-barba', nome: 'Barba' }),
      item({ chave: 'prod', tipo: 'produto', refId: 'prod-1', nome: 'Pomada' }),
      item({ chave: 'pac', tipo: 'pacote', refId: 'pacote-1', nome: '5 cortes' }),
    ]
    expect(sugerirTrocas(linhas, [saldo({})])).toHaveLength(0)
  })
})
