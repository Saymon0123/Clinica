import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  diaParaAbrir,
  proximoDeQualquerUm,
  rotuloDoHorarioMarcado,
  rotuloDoProximo,
  type BarbeiroDaAgenda,
} from './barbeiros'

/**
 * O caminho entra por PARÂMETRO, como nos outros tripwires (`ErroDeCarga`,
 * `aPromessaDeCobranca`). Escrito direto -- `new URL('./x.tsx',
 * import.meta.url)` --, o Vite o reescreve como endereço de asset
 * (http://localhost:3000/...), e o readFileSync recusa: "The URL must be of
 * scheme file".
 */
function fonte(arquivo: string) {
  return readFileSync(new URL(arquivo, import.meta.url), 'utf-8')
}

// Quinta-feira, 08/10/2026, 10:00 em São Paulo (13:00 UTC).
const AGORA = new Date('2026-10-08T13:00:00Z')

describe('o próximo horário de cada barbeiro', () => {
  it('hoje', () => {
    expect(rotuloDoProximo('2026-10-08T17:30:00Z', AGORA)).toBe('hoje às 14:30')
  })

  it('amanhã', () => {
    expect(rotuloDoProximo('2026-10-09T12:00:00Z', AGORA)).toBe('amanhã às 09:00')
  })

  it('mais longe: dia da semana e data', () => {
    expect(rotuloDoProximo('2026-10-16T12:00:00Z', AGORA)).toBe('sex, 16/10 às 09:00')
  })

  it('sem vaga é DITO, não escondido', () => {
    expect(rotuloDoProximo(null, AGORA)).toBe('sem vaga nos próximos 14 dias')
    expect(rotuloDoProximo('isso nao e data', AGORA)).toBe('sem vaga nos próximos 14 dias')
  })

  it('O FUSO: às 23h30 de São Paulo, meia-noite e meia é AMANHÃ -- não hoje', () => {
    // 23:30 em SP é 02:30 UTC do dia seguinte. Quem comparasse em UTC diria
    // "hoje" para um horário que é amanhã na barbearia.
    const tardeDaNoite = new Date('2026-10-09T02:30:00Z')
    expect(rotuloDoProximo('2026-10-09T03:30:00Z', tardeDaNoite)).toBe('amanhã às 00:30')
  })
})

describe('o horário marcado, na confirmação e na tela de sucesso', () => {
  it('diz o DIA, e não só a hora -- "10:00" sozinho parecia hoje', () => {
    expect(rotuloDoHorarioMarcado({ inicio: '2026-10-09T13:00:00Z', hora_local: '10:00' }, AGORA)).toBe(
      'Amanhã às 10:00',
    )
    expect(rotuloDoHorarioMarcado({ inicio: '2026-10-08T17:30:00Z', hora_local: '14:30' }, AGORA)).toBe(
      'Hoje às 14:30',
    )
    expect(rotuloDoHorarioMarcado({ inicio: '2026-10-16T12:00:00Z', hora_local: '09:00' }, AGORA)).toBe(
      'Sex, 16/10 às 09:00',
    )
  })

  it('instante quebrado cai na hora do servidor, nunca em "sem vaga"', () => {
    expect(rotuloDoHorarioMarcado({ inicio: 'isso nao e data', hora_local: '10:00' }, AGORA)).toBe('10:00')
  })

  it('A TELA usa o rótulo: nenhuma confirmação mostra a hora sozinha antes do barbeiro', () => {
    // O defeito morava no JSX, não nesta função: `{escolhido.hora_local} com
    // {escolhido.profissional}`, no passo 3 e no sucesso. Ler a página como
    // texto é o que impede a hora sozinha de voltar.
    const pagina = fonte('./AgendaPublicaPage.tsx')
    expect(pagina).not.toMatch(/hora_local\}(<\/strong>)?\s*com\b/)
    expect(pagina.match(/rotuloDoHorarioMarcado\(escolhido, agora\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('em que dia a grade abre depois da escolha', () => {
  const barbeiros: BarbeiroDaAgenda[] = [
    { id: 'diego', nome: 'Diego', proximo: '2026-10-09T12:00:00Z' },
    { id: 'rafael', nome: 'Rafael', proximo: '2026-10-08T17:00:00Z' },
    { id: 'thiago', nome: 'Thiago', proximo: null },
  ]

  it('O CORAÇÃO: abre no dia do próximo horário DELE -- quem só tem amanhã não cai num hoje vazio', () => {
    expect(diaParaAbrir('diego', barbeiros)).toBe('2026-10-09')
  })

  it('"qualquer um" abre no dia mais cedo entre todos', () => {
    expect(diaParaAbrir('qualquer', barbeiros)).toBe('2026-10-08')
    expect(proximoDeQualquerUm(barbeiros)).toBe('2026-10-08T17:00:00Z')
  })

  it('sem vaga na janela: não inventa dia', () => {
    expect(diaParaAbrir('thiago', barbeiros)).toBeNull()
    expect(proximoDeQualquerUm([{ id: 'x', nome: 'X', proximo: null }])).toBeNull()
  })
})
