import { describe, expect, it } from 'vitest'
import { JANELA_PADRAO, janelaDaGrade, type JornadaDoDia } from './janelaDaGrade'

/** Monta um ISO local no dia de hoje, para o teste não depender de fuso. */
function hoje(hora: number, minuto = 0) {
  const d = new Date()
  d.setHours(hora, minuto, 0, 0)
  return d.toISOString()
}

const semJornada: Record<string, JornadaDoDia> = {}

describe('a janela da grade da Agenda', () => {
  it('abraca a jornada com uma hora de folga de cada lado', () => {
    // 09:00–19:00 vira 08:00–20:00: doze horas em vez das dezesseis fixas de
    // antes, e as quatro que sobravam eram sempre vazias.
    const j = { a: { inicioMin: 9 * 60, fimMin: 19 * 60 } }
    expect(janelaDaGrade(j, [])).toEqual({ horaInicio: 8, horaFim: 20 })
  })

  it('pega a cadeira que abre mais cedo e a que fecha mais tarde', () => {
    const j = {
      a: { inicioMin: 10 * 60, fimMin: 19 * 60 },
      b: { inicioMin: 9 * 60, fimMin: 18 * 60 },
      c: { inicioMin: 11 * 60, fimMin: 20 * 60 },
    }
    expect(janelaDaGrade(j, [])).toEqual({ horaInicio: 8, horaFim: 21 })
  })

  it('cadeira de folga (jornada nula) nao encolhe nem estica a janela', () => {
    const j: Record<string, JornadaDoDia> = {
      a: { inicioMin: 9 * 60, fimMin: 19 * 60 },
      b: null,
    }
    expect(janelaDaGrade(j, [])).toEqual({ horaInicio: 8, horaFim: 20 })
  })

  it('ESTICA para caber horario fora do expediente', () => {
    // O projeto permite encaixe fora da jornada de propósito. Sem esta regra,
    // um horário das 20h numa barbearia que fecha às 19h existiria no banco e
    // seria invisível na tela -- a pior combinação possível.
    const j = { a: { inicioMin: 9 * 60, fimMin: 19 * 60 } }
    const fora = [{ data_hora_inicio: hoje(20, 30), data_hora_fim: hoje(21, 10) }]
    expect(janelaDaGrade(j, fora)).toEqual({ horaInicio: 8, horaFim: 23 })
  })

  it('estica tambem para tras, no encaixe da madrugada', () => {
    const j = { a: { inicioMin: 9 * 60, fimMin: 19 * 60 } }
    const cedo = [{ data_hora_inicio: hoje(6, 0), data_hora_fim: hoje(6, 40) }]
    expect(janelaDaGrade(j, cedo)).toEqual({ horaInicio: 5, horaFim: 20 })
  })

  it('sem jornada e sem horario, cai no padrao', () => {
    // Barbearia recém-criada, ou domingo em que ninguém trabalha.
    expect(janelaDaGrade(semJornada, [])).toEqual(JANELA_PADRAO)
  })

  it('a folga nao escapa do dia', () => {
    // Jornada colada na meia-noite não pode gerar hora -1 nem 25.
    const j = { a: { inicioMin: 0, fimMin: 24 * 60 } }
    expect(janelaDaGrade(j, [])).toEqual({ horaInicio: 0, horaFim: 24 })
  })

  it('data quebrada e ignorada em vez de virar NaN na grade', () => {
    // `new Date('qualquer coisa')` devolve Invalid Date, e um NaN aqui
    // apagaria a grade inteira sem erro nenhum no console.
    const j = { a: { inicioMin: 9 * 60, fimMin: 19 * 60 } }
    const ruim = [{ data_hora_inicio: 'nao e data', data_hora_fim: 'nem isso' }]
    expect(janelaDaGrade(j, ruim)).toEqual({ horaInicio: 8, horaFim: 20 })
  })

  it('garante duas horas de altura minima', () => {
    // Um único horário de 15 minutos daria uma grade de uma hora, com a régua
    // espremida e sem lugar para arrastar nada.
    const um = [{ data_hora_inicio: hoje(14, 0), data_hora_fim: hoje(14, 15) }]
    const janela = janelaDaGrade(semJornada, um)
    expect(janela.horaFim - janela.horaInicio).toBeGreaterThanOrEqual(2)
  })
})
