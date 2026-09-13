import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { faixaDoDia, semanaDe, situacaoAgora } from './horarioFuncionamento'

/**
 * O horário real da El Guardians, copiado do banco em 13/09/2026. Domingo é
 * `null` — é assim que o CRM grava dia de folga, e a tela precisa aguentar.
 */
const EL_GUARDIANS = {
  dom: null,
  seg: { abre: '09:00', fecha: '19:00' },
  ter: { abre: '09:00', fecha: '19:00' },
  qua: { abre: '09:00', fecha: '19:00' },
  qui: { abre: '09:00', fecha: '19:00' },
  sex: { abre: '09:00', fecha: '20:00' },
  sab: { abre: '09:00', fecha: '18:00' },
}

/** Uma data em São Paulo (UTC-3), escrita com o fuso explícito para o teste
 *  não depender do relógio de quem roda — nem da máquina do CI, que é UTC. */
const spo = (iso: string) => new Date(`${iso}-03:00`)

describe('faixaDoDia', () => {
  it('le o dia preenchido', () => {
    expect(faixaDoDia(EL_GUARDIANS, 'sex')).toEqual({ abre: '09:00', fecha: '20:00' })
  })

  it('trata folga como fechado', () => {
    expect(faixaDoDia(EL_GUARDIANS, 'dom')).toBeNull()
  })

  it('trata dia mal preenchido como fechado, sem estourar', () => {
    // A MESMA régua do `horarios_livres` e do `_shared/semHorario.ts`: o banco
    // filtra `^[0-9]{1,2}:[0-9]{2}$` antes do `::time`, senão um "9h" digitado
    // a mão derruba a consulta inteira (achado 5 do giro de 10/09).
    expect(faixaDoDia({ seg: { abre: '9h', fecha: '19:00' } }, 'seg')).toBeNull()
    expect(faixaDoDia({ seg: { abre: '09:00' } }, 'seg')).toBeNull()
    expect(faixaDoDia({ seg: 'aberto' }, 'seg')).toBeNull()
    expect(faixaDoDia(null, 'seg')).toBeNull()
    expect(faixaDoDia(undefined, 'seg')).toBeNull()
  })

  it('recusa faixa invertida', () => {
    // Fecha antes de abrir é dado impossível. Aceitar faria a conta de
    // "aberto agora" dar verdadeiro o dia inteiro.
    expect(faixaDoDia({ seg: { abre: '19:00', fecha: '09:00' } }, 'seg')).toBeNull()
    expect(faixaDoDia({ seg: { abre: '09:00', fecha: '09:00' } }, 'seg')).toBeNull()
  })

  it('poe o zero a esquerda que o cadastro a mao nao poe', () => {
    expect(faixaDoDia({ seg: { abre: '9:00', fecha: '19:00' } }, 'seg')).toEqual({
      abre: '09:00',
      fecha: '19:00',
    })
  })
})

describe('situacaoAgora', () => {
  // 2026-09-14 é uma segunda-feira.
  it('diz aberto e a hora de fechar', () => {
    expect(situacaoAgora(EL_GUARDIANS, spo('2026-09-14T14:00:00'))).toEqual({
      aberta: true,
      fecha: '19:00',
    })
  })

  it('antes de abrir, aponta para hoje', () => {
    expect(situacaoAgora(EL_GUARDIANS, spo('2026-09-14T07:30:00'))).toEqual({
      aberta: false,
      quando: 'hoje',
      hora: '09:00',
    })
  })

  it('depois de fechar, aponta para amanha', () => {
    // O caso que motivou a pílula: quem escaneia o QR às 21h via uma tela sem
    // horário nenhum e nada explicando que o expediente tinha acabado.
    expect(situacaoAgora(EL_GUARDIANS, spo('2026-09-14T21:00:00'))).toEqual({
      aberta: false,
      quando: 'amanhã',
      hora: '09:00',
    })
  })

  it('no minuto do fechamento ja esta fechada', () => {
    // `agora < fecha`, não `<=`: às 19:00 em ponto não se corta mais cabelo.
    expect(situacaoAgora(EL_GUARDIANS, spo('2026-09-14T19:00:00'))).toEqual({
      aberta: false,
      quando: 'amanhã',
      hora: '09:00',
    })
  })

  it('pula o dia de folga ao procurar a proxima abertura', () => {
    // Sábado 19h: já fechou (fecha 18h), domingo é folga, então é segunda.
    expect(situacaoAgora(EL_GUARDIANS, spo('2026-09-19T19:00:00'))).toEqual({
      aberta: false,
      quando: 'segunda',
      hora: '09:00',
    })
  })

  it('da a volta na semana para quem abre um dia so', () => {
    // Barbearia que só abre sábado, consultada num sábado à noite: a próxima
    // abertura é o mesmo dia da semana que vem. Sem a volta completa isto
    // devolveria null e a pílula sumiria justo de quem mais precisa dela.
    const soSabado = { sab: { abre: '09:00', fecha: '18:00' } }
    expect(situacaoAgora(soSabado, spo('2026-09-19T19:00:00'))).toEqual({
      aberta: false,
      quando: 'sábado',
      hora: '09:00',
    })
  })

  it('devolve null quando nao da para afirmar nada', () => {
    // Sem cadastro utilizável a tela NÃO mostra pílula. Dizer "Fechado" para
    // uma barbearia que só não preencheu o horário seria mentir para quem
    // está de pé no balcão vendo o barbeiro cortar.
    expect(situacaoAgora(null, spo('2026-09-14T14:00:00'))).toBeNull()
    expect(situacaoAgora({}, spo('2026-09-14T14:00:00'))).toBeNull()
    expect(situacaoAgora({ seg: { abre: '9h', fecha: 'x' } }, spo('2026-09-14T14:00:00'))).toBeNull()
  })

})

/**
 * O fuso do aparelho NÃO decide nada.
 *
 * Este bloco troca o fuso do processo de propósito. Sem isso o teste não
 * provava coisa alguma: a suíte inteira roda fixada em `America/Sao_Paulo`
 * (`vitest.config.ts`, e por um bom motivo — `rotuloDoDia` usa o fuso da
 * máquina de propósito), então uma implementação que lesse o fuso do aparelho
 * passaria aqui e só quebraria no celular de quem está viajando ou com o
 * relógio configurado em outro país. Conferido: com o fuso fixo, tirar o
 * `timeZone` da implementação não fazia teste nenhum falhar.
 */
describe('situacaoAgora com o aparelho em outro fuso', () => {
  const original = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'UTC'
  })
  afterAll(() => {
    process.env.TZ = original
  })

  it('le a hora da barbearia, nao a do aparelho', () => {
    // 2026-09-14T23:30 em São Paulo é 2026-09-15T02:30 em UTC. Pelo aparelho
    // seria terça de madrugada, antes de abrir — "abre hoje às 09:00". Pela
    // barbearia é segunda à noite, já fechada, e a próxima abertura é amanhã.
    const meiaNoiteQuase = new Date('2026-09-15T02:30:00Z')
    expect(situacaoAgora(EL_GUARDIANS, meiaNoiteQuase)).toEqual({
      aberta: false,
      quando: 'amanhã',
      hora: '09:00',
    })
  })

  it('marca o dia certo no quadro da semana', () => {
    const semana = semanaDe(EL_GUARDIANS, new Date('2026-09-15T02:30:00Z'))
    // Segunda, não terça: em São Paulo o dia ainda não virou.
    expect(semana?.find((d) => d.hoje)?.chave).toBe('seg')
  })
})

describe('semanaDe', () => {
  it('ordena de segunda a domingo e marca hoje', () => {
    const semana = semanaDe(EL_GUARDIANS, spo('2026-09-14T14:00:00'))
    expect(semana?.map((d) => d.chave)).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'])
    expect(semana?.find((d) => d.hoje)?.chave).toBe('seg')
    expect(semana?.find((d) => d.chave === 'dom')?.faixa).toBeNull()
    expect(semana?.find((d) => d.chave === 'sex')?.faixa).toEqual({ abre: '09:00', fecha: '20:00' })
  })

  it('devolve null quando nenhum dia tem faixa valida', () => {
    // Sete linhas de "Fechado" não informam nada e ainda passam a impressão de
    // barbearia fechada para sempre. Melhor não mostrar o quadro.
    expect(semanaDe(null, spo('2026-09-14T14:00:00'))).toBeNull()
    expect(semanaDe({ dom: null, seg: null }, spo('2026-09-14T14:00:00'))).toBeNull()
  })
})
