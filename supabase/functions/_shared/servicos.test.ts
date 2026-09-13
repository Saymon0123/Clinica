import { describe, expect, it } from 'vitest'
import { servicosPedidos, somaDuracao } from './servicos'

/** O catálogo real da El Guardians, copiado do banco em 13/09/2026. */
const CATALOGO = [
  { id: 'barba', duracao_minutos: 30 },
  { id: 'infantil', duracao_minutos: 40 },
  { id: 'corte', duracao_minutos: 40 },
  { id: 'corte-barba', duracao_minutos: 60 },
]

const ids = (lista: { id: string }[]) => lista.map((s) => s.id)

describe('servicosPedidos', () => {
  it('aceita varios e devolve na ordem escolhida', () => {
    // A ordem vira `appointment_services.ordem` e decide o principal.
    expect(ids(servicosPedidos({ servicoIds: ['corte', 'barba'] }, CATALOGO))).toEqual([
      'corte',
      'barba',
    ])
    expect(ids(servicosPedidos({ servicoIds: ['barba', 'corte'] }, CATALOGO))).toEqual([
      'barba',
      'corte',
    ])
  })

  it('NAO conta o mesmo servico duas vezes', () => {
    // O caso perigoso. A chave primária da filha é (appointment_id, service_id),
    // então o banco engoliria a linha repetida em silêncio — mas a duração
    // somada aqui já teria reservado o dobro. Meia hora de cadeira vazia paga
    // pelo cliente, e a barbearia sem o encaixe seguinte.
    const escolhidos = servicosPedidos({ servicoIds: ['corte', 'corte', 'corte'] }, CATALOGO)
    expect(ids(escolhidos)).toEqual(['corte'])
    expect(somaDuracao(escolhidos)).toBe(40)
  })

  it('descarta id que nao esta no catalogo do salao', () => {
    // A lista de partida JÁ é só deste salão e só ativa. Serviço de outra
    // barbearia, serviço desativado e id inventado caem todos aqui.
    expect(ids(servicosPedidos({ servicoIds: ['corte', 'de-outro-salao'] }, CATALOGO))).toEqual([
      'corte',
    ])
    expect(servicosPedidos({ servicoIds: ['nao-existe'] }, CATALOGO)).toEqual([])
  })

  it('ignora o que nao e texto', () => {
    // Corpo de requisição é dado da rua: número, nulo, objeto e lista dentro de
    // lista chegam aqui um dia.
    //
    // Teste de caracterização, não catraca — conferido: tirar o `typeof` da
    // implementação NÃO faz este teste falhar, porque o cruzamento com o
    // catálogo já descarta tudo que não casa com um id. O `typeof` fica pelo
    // tipo (o `Set<string>` precisa dele) e como cinto sobre suspensório.
    expect(
      ids(servicosPedidos({ servicoIds: [1, null, undefined, {}, ['corte'], 'barba'] }, CATALOGO)),
    ).toEqual(['barba'])
  })

  it('aceita o campo singular, da tela anterior a esta', () => {
    // A edge sobe minutos antes de a Vercel terminar o build. Nesse intervalo a
    // tela antiga só sabe mandar `servicoId`.
    expect(ids(servicosPedidos({ servicoId: 'corte' }, CATALOGO))).toEqual(['corte'])
  })

  it('devolve vazio quando nao da para resolver nada', () => {
    // Quem chama decide o que fazer com o vazio: o `consultar` cai no primeiro
    // do catálogo, o `agendar` recusa. São decisões diferentes de propósito.
    expect(servicosPedidos({}, CATALOGO)).toEqual([])
    expect(servicosPedidos({ servicoIds: [] }, CATALOGO)).toEqual([])
    expect(servicosPedidos({ servicoIds: 'nao-e-lista' }, CATALOGO)).toEqual([])
    expect(servicosPedidos({ servicoId: 'corte' }, [])).toEqual([])
  })
})

describe('somaDuracao', () => {
  it('soma os minutos que a cadeira fica ocupada', () => {
    // 40 + 30 = 70. É este número que vai para `horarios_livres` E para o
    // `data_hora_fim` do agendamento — reservar 40 num atendimento de 70
    // liberava os 30 finais para outra pessoa.
    expect(somaDuracao(servicosPedidos({ servicoIds: ['corte', 'barba'] }, CATALOGO))).toBe(70)
  })

  it('zero sem servico nenhum', () => {
    expect(somaDuracao([])).toBe(0)
  })
})
