import { describe, expect, it } from 'vitest'
import { chaveDoDia, motivoSemHorario } from './semHorario'

const HORARIO = {
  dom: null,
  seg: { abre: '09:00', fecha: '19:00' },
  sab: { abre: '09:00', fecha: '18:00' },
  qua: { abre: '', fecha: '19:00' }, // dia mal preenchido
}

/** M8: a lista vazia diz POR QUE está vazia. */
describe('motivo da agenda pública sem horário', () => {
  it('chave do dia pela data de São Paulo', () => {
    expect(chaveDoDia('2026-09-13')).toBe('dom')
    expect(chaveDoDia('2026-09-14')).toBe('seg')
    expect(chaveDoDia('2026-09-12')).toBe('sab')
  })

  it('dia fechado no horário da barbearia', () => {
    expect(motivoSemHorario({ horario: HORARIO, dia: 'dom', agora: '10:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'fechado_hoje',
    )
  })

  it('dia sem chave, dia mal preenchido e horário inexistente contam como fechado — como em horarios_livres', () => {
    expect(motivoSemHorario({ horario: HORARIO, dia: 'ter', agora: '10:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'fechado_hoje',
    )
    expect(motivoSemHorario({ horario: HORARIO, dia: 'qua', agora: '10:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'fechado_hoje',
    )
    expect(motivoSemHorario({ horario: null, dia: 'seg', agora: '10:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'fechado_hoje',
    )
  })

  it('aberto no papel, mas ninguém da equipe trabalha hoje: fechado', () => {
    expect(motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '10:00', alguemTrabalhaHoje: false, ehHoje: true })).toBe(
      'fechado_hoje',
    )
  })

  it('link aberto depois do fechamento — inclusive exatamente na hora', () => {
    expect(motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '23:10', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'expediente_acabou',
    )
    expect(motivoSemHorario({ horario: HORARIO, dia: 'sab', agora: '18:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'expediente_acabou',
    )
  })

  it('aberto, com gente trabalhando e antes de fechar: é agenda cheia para esse serviço', () => {
    expect(motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '18:30', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'lotado',
    )
    // Antes de abrir e sem vaga no dia inteiro também é cheio, não fechado.
    expect(motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '07:00', alguemTrabalhaHoje: true, ehHoje: true })).toBe(
      'lotado',
    )
  })
})

/**
 * Etapa 2, catorze dias: o relógio só vale para hoje.
 *
 * Antes desta separação a função só conhecia um dia, então "agora" e "o dia
 * consultado" eram a mesma coisa. Com catorze, quem abre a página às 21h e toca
 * na quinta-feira da semana que vem receberia "o expediente de HOJE já acabou"
 * — a frase certa para o dia errado. E o defeito só apareceria à noite, que é
 * quando ninguém está olhando.
 */
describe('dia futuro: o relógio de hoje não decide nada', () => {
  it('dia futuro sem vaga é LOTADO, mesmo consultado depois do fechamento', () => {
    expect(
      motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '23:10', alguemTrabalhaHoje: true, ehHoje: false }),
    ).toBe('lotado')
    expect(
      motivoSemHorario({ horario: HORARIO, dia: 'sab', agora: '18:00', alguemTrabalhaHoje: true, ehHoje: false }),
    ).toBe('lotado')
  })

  it('dia futuro de folga continua FECHADO', () => {
    // O que não depende do relógio não muda: folga é folga em qualquer dia.
    expect(
      motivoSemHorario({ horario: HORARIO, dia: 'dom', agora: '23:10', alguemTrabalhaHoje: true, ehHoje: false }),
    ).toBe('fechado_hoje')
    expect(
      motivoSemHorario({ horario: HORARIO, dia: 'seg', agora: '10:00', alguemTrabalhaHoje: false, ehHoje: false }),
    ).toBe('fechado_hoje')
  })
})
