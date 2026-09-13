import { describe, expect, it } from 'vitest'
import { dobrarLinha, escaparTexto, eventoIcs, marcaDeTempo } from './calendario'

const AGORA = new Date('2026-09-13T18:00:00Z')

const base = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  titulo: 'Corte masculino + Barba',
  inicio: new Date('2026-09-14T13:00:00Z'), // 10:00 em São Paulo
  fim: new Date('2026-09-14T14:10:00Z'), // 11:10
  agora: AGORA,
}

describe('escaparTexto', () => {
  it('escapa a contrabarra ANTES do resto', () => {
    // Se a vírgula fosse escapada primeiro, a contrabarra inserida por ela
    // seria escapada de novo e o arquivo sairia com `\\,` — o calendário
    // mostraria a contrabarra na tela.
    expect(escaparTexto('a\\b,c')).toBe('a\\\\b\\,c')
  })

  it('escapa virgula e ponto e virgula, que sao separadores no formato', () => {
    // Sem isto, "Corte, barba e sobrancelha" vira três valores e o título
    // aparece cortado no calendário.
    expect(escaparTexto('Corte, barba; sobrancelha')).toBe('Corte\\, barba\\; sobrancelha')
  })

  it('transforma quebra de linha em \\n literal', () => {
    expect(escaparTexto('linha1\nlinha2')).toBe('linha1\\nlinha2')
    expect(escaparTexto('linha1\r\nlinha2')).toBe('linha1\\nlinha2')
  })
})

describe('marcaDeTempo', () => {
  it('usa o formato UTC do iCalendar', () => {
    expect(marcaDeTempo(new Date('2026-09-14T13:00:00Z'))).toBe('20260914T130000Z')
  })

  it('converte para UTC em vez de usar a hora local', () => {
    // 10:00 em São Paulo é 13:00Z. O arquivo carrega o instante, e o celular
    // mostra no fuso dele — é assim que funciona para quem viaja.
    expect(marcaDeTempo(new Date('2026-09-14T10:00:00-03:00'))).toBe('20260914T130000Z')
  })
})

describe('dobrarLinha', () => {
  it('deixa linha curta intacta', () => {
    expect(dobrarLinha('SUMMARY:Corte')).toBe('SUMMARY:Corte')
  })

  it('dobra em 75 e continua com um espaco', () => {
    const longa = `SUMMARY:${'a'.repeat(100)}`
    const dobrada = dobrarLinha(longa)
    const partes = dobrada.split('\r\n')
    expect(partes.length).toBeGreaterThan(1)
    expect(partes[0]).toHaveLength(75)
    expect(partes[1].startsWith(' ')).toBe(true)
    // Remontar tem de devolver o original.
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(longa)
  })

  it('conta BYTES, nao caracteres', () => {
    // "Sobrancelha" tem acento em português de verdade, e cada letra acentuada
    // ocupa dois bytes. Cortando por caractere, a linha estoura o limite em
    // texto português sem ninguém perceber — e Google Agenda e Outlook recusam
    // o arquivo INTEIRO quando isso acontece.
    const acentuada = `SUMMARY:${'á'.repeat(60)}`
    for (const parte of dobrarLinha(acentuada).split('\r\n')) {
      expect(new TextEncoder().encode(parte).length).toBeLessThanOrEqual(75)
    }
  })
})

describe('eventoIcs', () => {
  const ics = eventoIcs(base)

  it('abre e fecha como um calendario valido', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })

  it('termina as linhas em CRLF, como o RFC exige', () => {
    // Leitor que aceita `\n` sozinho é a exceção, não a regra.
    expect(ics.split('\r\n').length).toBeGreaterThan(10)
    expect(/[^\r]\n/.test(ics)).toBe(false)
  })

  it('leva inicio, fim e identificador', () => {
    expect(ics).toContain('DTSTART:20260914T130000Z')
    expect(ics).toContain('DTEND:20260914T141000Z')
    expect(ics).toContain(`UID:${base.id}@clubcut`)
    expect(ics).toContain('DTSTAMP:20260913T180000Z')
  })

  it('omite local e descricao quando nao ha', () => {
    // Linha vazia de LOCATION faz alguns calendários mostrarem um endereço em
    // branco, que parece campo que não carregou.
    expect(ics).not.toContain('LOCATION')
    expect(ics).not.toContain('DESCRIPTION:\r\n')
  })

  it('inclui local quando a barbearia tem endereco', () => {
    const com = eventoIcs({ ...base, local: 'Rua das Flores, 100' })
    expect(com).toContain('LOCATION:Rua das Flores\\, 100')
  })

  it('poe um aviso uma hora antes', () => {
    // O do WhatsApp chega entre T-85 e T-100min e depende de sinal e da
    // barbearia estar em dia; este é do próprio celular.
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-PT1H')
  })
})
