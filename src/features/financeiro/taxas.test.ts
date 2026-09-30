import { describe, expect, it } from 'vitest'
import {
  COMPOSICAO_VAZIA,
  DESEMPENHO_VAZIO,
  direcao,
  formatHoras,
  formatMedia,
  formatPercentual,
  ocupacao,
  servicosPorAtendimento,
  taxaDeRetorno,
  ticketMedio,
  melhorDiaDaSemana,
  nomeDoDia,
  participacao,
  formatReal,
  type Composicao,
  type Desempenho,
} from './taxas'

const com = (p: Partial<Desempenho>): Desempenho => ({ ...DESEMPENHO_VAZIO, ...p })

describe('as taxas do barbeiro', () => {
  it('ocupacao e o que da jornada virou atendimento', () => {
    expect(ocupacao(com({ minutosOcupados: 150, minutosJornada: 900 }))).toBeCloseTo(16.667, 2)
    expect(ocupacao(com({ minutosOcupados: 460, minutosJornada: 49680 }))).toBeCloseTo(0.926, 2)
  })

  it('sem jornada cadastrada, ocupacao e NULA -- nao zero', () => {
    // Este é o ponto todo do `null`: "0%" acusaria o barbeiro de uma preguiça
    // que é, na verdade, um cadastro faltando em Equipe.
    expect(ocupacao(com({ minutosOcupados: 150, minutosJornada: 0 }))).toBeNull()
    expect(ocupacao(DESEMPENHO_VAZIO)).toBeNull()
  })

  it('ocupacao passa de 100 sem ser cortada', () => {
    // Encaixe fora do expediente é permitido de propósito no projeto. "110%"
    // não é bug: é a notícia de que ele atende fora da jornada que cadastrou.
    expect(ocupacao(com({ minutosOcupados: 660, minutosJornada: 600 }))).toBeCloseTo(110, 5)
  })

  it('taxa de retorno olha CLIENTES, nao atendimentos', () => {
    // O cliente atendido duas vezes no período conta uma vez -- senão quem tem
    // um freguês fiel e mais ninguém marcaria 100%.
    expect(taxaDeRetorno(com({ clientes: 2, clientesQueVoltaram: 1 }))).toBe(50)
    expect(taxaDeRetorno(com({ clientes: 10, clientesQueVoltaram: 7 }))).toBe(70)
  })

  it('sem cliente atendido, retorno e nulo', () => {
    expect(taxaDeRetorno(com({ clientes: 0, clientesQueVoltaram: 0 }))).toBeNull()
  })

  it('servicos por atendimento e media, nao soma', () => {
    expect(servicosPorAtendimento(com({ servicos: 4, atendimentos: 3 }))).toBeCloseTo(1.333, 3)
    expect(servicosPorAtendimento(com({ servicos: 3, atendimentos: 3 }))).toBe(1)
  })

  it('sem atendimento, a media e nula e nao divisao por zero', () => {
    expect(servicosPorAtendimento(com({ servicos: 0, atendimentos: 0 }))).toBeNull()
  })

  it('horas legiveis, sem casa decimal', () => {
    expect(formatHoras(460)).toBe('7h40')
    expect(formatHoras(2040)).toBe('34h')
    expect(formatHoras(45)).toBe('45min')
    expect(formatHoras(0)).toBe('0min')
  })

  it('horas nao viram negativo nem quebrado', () => {
    expect(formatHoras(-10)).toBe('0min')
    expect(formatHoras(90.6)).toBe('1h31')
  })

  it('numero em portugues: virgula, nao ponto', () => {
    expect(formatPercentual(16.6667)).toBe('16,7%')
    expect(formatMedia(1.3333)).toBe('1,3')
  })

  it('a direcao ignora diferenca que nao significa nada', () => {
    // Sem a zona morta, 12,01% contra 12,00% acenderia uma seta verde.
    expect(direcao(12.01, 12.0)).toBe('igual')
    expect(direcao(12.4, 12.0)).toBe('igual')
    expect(direcao(14, 12)).toBe('subiu')
    expect(direcao(10, 12)).toBe('desceu')
  })

  it('sem periodo anterior nao ha direcao', () => {
    // Barbearia no primeiro mês não tem com que comparar, e inventar uma seta
    // ali diria que algo melhorou quando nada aconteceu ainda.
    expect(direcao(12, null)).toBeNull()
    expect(direcao(null, 12)).toBeNull()
    expect(direcao(null, null)).toBeNull()
  })
})

describe('de onde vem o dinheiro (parte 2)', () => {
  const comp = (p: Partial<Composicao>): Composicao => ({ ...COMPOSICAO_VAZIA, ...p })

  it('ticket medio sai do FATURAMENTO, nao da soma dos itens', () => {
    // As duas bases divergem quando há desconto, pacote cobrindo item ou
    // pagamento parcial. O ticket usa a mesma do cartão "Faturamento" para o
    // dono poder dividir o que vê na tela e chegar no mesmo número.
    expect(ticketMedio(comp({ faturamento: 450, comandas: 4, vendidoTotal: 480 }))).toBe(112.5)
  })

  it('sem comanda fechada, ticket e nulo e nao zero', () => {
    expect(ticketMedio(comp({ faturamento: 0, comandas: 0 }))).toBeNull()
  })

  it('a participacao tem o VENDIDO no denominador, nao o faturamento', () => {
    // Com desconto, faturamento (450) e vendido (480) divergem. Usar 450 aqui
    // faria as três fatias somarem mais de 100%.
    const c = comp({
      faturamento: 450,
      vendidoTotal: 480,
      vendidoServico: 200,
      vendidoProduto: 80,
      vendidoPacote: 200,
    })
    const fatias = [
      participacao(c.vendidoServico, c.vendidoTotal),
      participacao(c.vendidoProduto, c.vendidoTotal),
      participacao(c.vendidoPacote, c.vendidoTotal),
    ]
    // `reduce<number>`: sem o genérico, o TS infere o acumulador do tipo do
    // array (`number | null`) e reclama que `s` pode ser nulo.
    expect(fatias.reduce<number>((s, f) => s + (f ?? 0), 0)).toBeCloseTo(100, 6)
    expect(participacao(80, 480)).toBeCloseTo(16.667, 2)
  })

  it('sem nada vendido, a participacao e nula', () => {
    expect(participacao(0, 0)).toBeNull()
  })

  it('o melhor dia cala quando ha venda de menos para falar', () => {
    // Sete dias repartindo seis vendas dão um "vencedor" com duas, e "terça é
    // o seu melhor dia" aí não é relatório: é ruído com cara de conselho.
    expect(melhorDiaDaSemana(comp({ comandas: 6, melhorDia: 2, melhorDiaComandas: 2 }))).toBeNull()
    // Período grande, mas o dia vencedor com pouca coisa: também cala.
    expect(melhorDiaDaSemana(comp({ comandas: 20, melhorDia: 2, melhorDiaComandas: 2 }))).toBeNull()
  })

  it('com amostra suficiente, o melhor dia aparece por extenso', () => {
    const d = melhorDiaDaSemana(
      comp({ comandas: 20, melhorDia: 4, melhorDiaFaturamento: 900, melhorDiaComandas: 7 }),
    )
    expect(d).toEqual({ nome: 'quinta', faturamento: 900, comandas: 7 })
  })

  it('sem venda nenhuma nao ha dia para apontar', () => {
    expect(melhorDiaDaSemana(COMPOSICAO_VAZIA)).toBeNull()
  })

  it('os dias da semana batem com o dow do Postgres (0=domingo)', () => {
    // `extract(dow ...)` devolve 0 para domingo. Trocar a ordem aqui faria o
    // relatório apontar o dia errado sem nada quebrar.
    expect(nomeDoDia(0)).toBe('domingo')
    expect(nomeDoDia(6)).toBe('sábado')
    expect(nomeDoDia(4)).toBe('quinta')
  })

  it('reais em portugues', () => {
    expect(formatReal(112.5).replace(/ /g, ' ')).toBe('R$ 112,50')
  })
})
