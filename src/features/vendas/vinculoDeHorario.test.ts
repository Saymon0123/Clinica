import { describe, expect, it } from 'vitest'
import {
  SEM_LINHA,
  faltaResponder,
  mensagemDeFalhaNoVinculo,
  perguntaDoVinculo,
  rotuloDoHorario,
  type HorarioDoDia,
} from './vinculoDeHorario'

// Hora montada no fuso LOCAL: a formatação também é local, então o teste dá o
// mesmo resultado no CI (UTC) e na máquina do balcão (São Paulo).
const as = (h: number, m = 0) => new Date(2026, 8, 11, h, m).toISOString()

const horario = (mudanca: Partial<HorarioDoDia> = {}): HorarioDoDia => ({
  id: 'a1',
  inicio: as(14),
  status: 'agendado',
  professionalId: 'p1',
  barbeiro: 'Rafael',
  ...mudanca,
})

/** A7 do giro de 10/09: a venda precisa dizer de qual horário ela é. */
describe('vínculo da venda com o horário de hoje', () => {
  it('um horário: pergunta direta, com hora e barbeiro', () => {
    expect(perguntaDoVinculo('João', [horario()])).toBe(
      'João tem horário hoje às 14:00 com Rafael. Esta venda é desse atendimento?',
    )
  })

  it('horário que ficou como "não veio": a pergunta diz isso, porque é a venda que corrige', () => {
    expect(perguntaDoVinculo('João', [horario({ status: 'faltou' })])).toBe(
      'O horário de João hoje às 14:00 com Rafael ficou como “não veio”. Esta venda é desse atendimento?',
    )
  })

  it('sem barbeiro conhecido, a frase não fica pela metade', () => {
    expect(perguntaDoVinculo('João', [horario({ barbeiro: null })])).toBe(
      'João tem horário hoje às 14:00. Esta venda é desse atendimento?',
    )
  })

  it('vários horários: pergunta de qual, e cada botão diz hora, barbeiro e se ficou como não veio', () => {
    const tarde = horario({ id: 'a2', inicio: as(16, 30), status: 'faltou', barbeiro: 'Pedro' })
    expect(perguntaDoVinculo('João', [horario(), tarde])).toBe(
      'João tem 2 horários hoje. Esta venda é de algum deles?',
    )
    expect(rotuloDoHorario(horario())).toBe('14:00 · Rafael')
    expect(rotuloDoHorario(tarde)).toBe('16:30 · Pedro · não veio')
  })

  it('a venda só sai com a pergunta respondida', () => {
    expect(faltaResponder({ vinculado: false, semVinculo: false, horarios: 1 })).toBe(true)
    expect(faltaResponder({ vinculado: true, semVinculo: false, horarios: 1 })).toBe(false)
    expect(faltaResponder({ vinculado: false, semVinculo: true, horarios: 2 })).toBe(false)
    // Cliente sem horário hoje: não há o que perguntar.
    expect(faltaResponder({ vinculado: false, semVinculo: false, horarios: 0 })).toBe(false)
  })

  it('cadeira já ocupada (23P01): explica e manda desvincular, em vez de "tente de novo"', () => {
    const texto = mensagemDeFalhaNoVinculo({ code: '23P01' }, '14:00')
    expect(texto).toContain('das 14:00 já foi ocupada por outro atendimento')
    expect(texto).toContain('Desvincular')
    expect(texto).not.toContain('tente novamente')
  })

  it('horário que sumiu da agenda (update sem linha ou chave estrangeira): mesma saída', () => {
    for (const code of [SEM_LINHA, '23503']) {
      const texto = mensagemDeFalhaNoVinculo({ code }, null)
      expect(texto).toContain('O horário vinculado não está mais na agenda')
      expect(texto).toContain('Desvincular')
    }
  })

  it('qualquer outra falha: a frase de sempre', () => {
    expect(mensagemDeFalhaNoVinculo({ code: '42501' }, '14:00')).toBe(
      'Não foi possível completar a venda. Nada foi salvo, tente novamente.',
    )
    expect(mensagemDeFalhaNoVinculo(null, null)).toBe(
      'Não foi possível completar a venda. Nada foi salvo, tente novamente.',
    )
  })
})
