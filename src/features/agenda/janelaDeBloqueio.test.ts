import { describe, expect, it } from 'vitest'
import {
  DIA_INTEIRO,
  MOTIVO_MAX,
  erroDaJanela,
  fimDeslocado,
  horaDe,
  minutosDe,
} from './janelaDeBloqueio'

describe('a janela do bloqueio', () => {
  it('converte hora e volta sem perder minuto', () => {
    expect(minutosDe('00:00')).toBe(0)
    expect(minutosDe('12:30')).toBe(750)
    expect(minutosDe('23:59')).toBe(1439)
    expect(horaDe(750)).toBe('12:30')
    expect(horaDe(0)).toBe('00:00')
    expect(horaDe(1439)).toBe('23:59')
  })

  it('nao deixa a hora escapar do dia', () => {
    // O input `type="time"` já segura, mas a conta do deslocamento pode
    // estourar sozinha e daí sairia '25:10', que o banco recusa sem explicar.
    expect(horaDe(-30)).toBe('00:00')
    expect(horaDe(2000)).toBe('23:59')
  })

  it('entrada quebrada vira zero em vez de NaN', () => {
    // 'NaN:NaN' no input seria pior que uma janela errada: o campo fica ilegível
    // e o barbeiro não tem como consertar a não ser fechando o modal.
    expect(minutosDe('')).toBe(0)
    expect(minutosDe('abc')).toBe(0)
  })

  it('adiantar o inicio leva o fim junto, preservando a duracao', () => {
    // Quem já ajustou "até as 14h" e depois adianta o começo não quer o fim
    // recalculado do zero.
    expect(fimDeslocado('12:00', '11:30', '14:00')).toBe('13:30')
    expect(fimDeslocado('12:00', '13:00', '13:00')).toBe('14:00')
  })

  it('no fim do dia a janela encolhe em vez de virar a madrugada', () => {
    // O formulário tem uma data só: bloqueio que cruza a meia-noite não existe.
    expect(fimDeslocado('09:00', '23:30', '10:00')).toBe('23:59')
  })

  it('duracao invertida nao vira negativa ao arrastar', () => {
    // Se o fim já estivesse antes do início (estado que `erroDaJanela` barra na
    // hora de salvar, mas que existe enquanto ele digita), a duração ficaria
    // negativa e o fim andaria para TRÁS do novo início.
    expect(fimDeslocado('14:00', '15:00', '13:00')).toBe('15:10')
  })

  it('recusa fim igual ou antes do inicio, em portugues', () => {
    expect(erroDaJanela('12:00', '11:00')).toBe('O fim do bloqueio precisa ser depois do início.')
    expect(erroDaJanela('12:00', '12:00')).toBe('O fim do bloqueio precisa ser depois do início.')
  })

  it('deixa passar a janela de pe', () => {
    expect(erroDaJanela('12:00', '13:00')).toBeNull()
    expect(erroDaJanela(DIA_INTEIRO.inicio, DIA_INTEIRO.fim)).toBeNull()
  })

  it('o dia inteiro cobre do primeiro ao ultimo minuto', () => {
    expect(minutosDe(DIA_INTEIRO.inicio)).toBe(0)
    expect(minutosDe(DIA_INTEIRO.fim)).toBe(1439)
  })

  it('o teto do motivo acompanha o CHECK do banco', () => {
    // Se a migration 0182 mudar o CHECK e ninguém mexer aqui, o barbeiro
    // digita, salva e recebe 23514 em inglês.
    expect(MOTIVO_MAX).toBe(60)
  })
})
