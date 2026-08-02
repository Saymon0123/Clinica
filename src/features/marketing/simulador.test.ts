import { describe, it, expect } from 'vitest'
import { simular, TAXAS_PADRAO, type EntradaSimulacao } from './simulador'

const base: EntradaSimulacao = {
  clientes: 100,
  ticketMedio: 50,
  descontoTipo: 'percentual',
  descontoValor: 20,
  comissaoPercentual: 40,
  descontoReduzComissao: false,
  taxaRetornoEspontaneo: 0.05,
  taxaRetornoComCampanha: 0.15,
}

describe('simular', () => {
  it('desconta sobre o ticket e mede a margem depois da comissão', () => {
    const r = simular(base)
    expect(r.descontoPorCliente).toBe(10) // 20% de R$ 50
    expect(r.margemPorCliente).toBe(30) // R$ 50 menos 40% de comissão
    expect(r.margemComDesconto).toBe(20) // a casa absorve os R$ 10
  })

  it('sem rateio, a barbearia absorve o desconto inteiro', () => {
    const r = simular({ ...base, descontoReduzComissao: false })
    expect(r.descontoAbsorvido).toBe(10)
    expect(r.descontoDoBarbeiro).toBe(0)
  })

  it('com rateio, o barbeiro perde comissão proporcional ao desconto', () => {
    const r = simular({ ...base, descontoReduzComissao: true })
    expect(r.descontoDoBarbeiro).toBe(4) // 40% dos R$ 10
    expect(r.descontoAbsorvido).toBe(6)
    // A margem da casa sofre menos, então o negócio fica melhor para o dono —
    // é exatamente essa diferença que a tela precisa mostrar ao lado da opção.
    expect(r.margemComDesconto).toBe(24)
  })

  it('conta como incremental só quem a campanha trouxe a mais', () => {
    const r = simular(base)
    expect(r.clientesQueVoltamSozinhos).toBe(5) // 5% de 100
    expect(r.clientesIncrementais).toBe(10) // 15% menos os 5% espontâneos
  })

  it('cobra o desconto dado a quem voltaria sozinho', () => {
    const r = simular(base)
    // 5 pessoas × R$ 10 de desconto que não precisariam ter ganhado
    expect(r.custoDoVazamento).toBe(50)
    // 10 incrementais × R$ 20 de margem, menos o vazamento
    expect(r.resultadoLiquido).toBe(150)
  })

  it('o ponto de equilíbrio cobre o vazamento, não o desconto todo', () => {
    const r = simular(base)
    // R$ 50 de vazamento ÷ R$ 20 de margem = 3 clientes a mais
    expect(r.clientesParaEmpatar).toBe(3)
  })

  it('desconto maior exige mais clientes para empatar', () => {
    const pequeno = simular({ ...base, descontoValor: 10 })
    const grande = simular({ ...base, descontoValor: 40 })
    expect(grande.clientesParaEmpatar).toBeGreaterThan(pequeno.clientesParaEmpatar!)
  })

  it('avisa quando o desconto come a margem inteira', () => {
    // Comissão de 40% deixa R$ 30 de margem; 60% de desconto são R$ 30.
    const r = simular({ ...base, descontoValor: 60 })
    expect(r.descontoExcedeMargem).toBe(true)
    // Sem margem não existe número de clientes que resolva — a tela precisa
    // dizer isso, e não exibir um número gigante como se fosse uma meta.
    expect(r.clientesParaEmpatar).toBeNull()
  })

  it('nao deixa o desconto passar do ticket', () => {
    const r = simular({ ...base, descontoTipo: 'valor', descontoValor: 500 })
    expect(r.descontoPorCliente).toBe(50)
  })

  it('aceita desconto em valor fixo', () => {
    const r = simular({ ...base, descontoTipo: 'valor', descontoValor: 15 })
    expect(r.descontoPorCliente).toBe(15)
    expect(r.margemComDesconto).toBe(15)
  })

  it('campanha que converte menos que o espontaneo nao inventa ganho', () => {
    const r = simular({ ...base, taxaRetornoComCampanha: 0.02 })
    expect(r.clientesIncrementais).toBe(0)
    expect(r.resultadoLiquido).toBeLessThan(0)
  })

  it('segmento vazio nao quebra', () => {
    const r = simular({ ...base, clientes: 0 })
    expect(r.resultadoLiquido).toBe(0)
    expect(r.clientesParaEmpatar).toBe(0)
  })

  it('ticket zero nao gera divisao invalida', () => {
    const r = simular({ ...base, ticketMedio: 0 })
    expect(Number.isFinite(r.resultadoLiquido)).toBe(true)
    expect(r.clientesParaEmpatar).toBeNull()
  })

  it('aniversariantes vazam mais desconto que sumidos', () => {
    // Cliente ativo viria de qualquer jeito: o desconto de aniversário é o que
    // mais paga por venda que já aconteceria.
    expect(TAXAS_PADRAO.aniversariantes.espontaneo).toBeGreaterThan(
      TAXAS_PADRAO.sumidos.espontaneo,
    )
    const aniversario = simular({ ...base, ...taxas('aniversariantes') })
    const sumidos = simular({ ...base, ...taxas('sumidos') })
    expect(aniversario.custoDoVazamento).toBeGreaterThan(sumidos.custoDoVazamento)
  })
})

function taxas(segmento: keyof typeof TAXAS_PADRAO) {
  return {
    taxaRetornoEspontaneo: TAXAS_PADRAO[segmento].espontaneo,
    taxaRetornoComCampanha: TAXAS_PADRAO[segmento].comCampanha,
  }
}
