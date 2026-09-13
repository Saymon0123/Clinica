import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montarFaixa, proximoDiaComVaga, temAlgumDiaLivre, type ContagemDoDia } from './dias'

/** O horário real da El Guardians: domingo é folga. */
const HORARIO = {
  dom: null,
  seg: { abre: '09:00', fecha: '19:00' },
  ter: { abre: '09:00', fecha: '19:00' },
  qua: { abre: '09:00', fecha: '19:00' },
  qui: { abre: '09:00', fecha: '19:00' },
  sex: { abre: '09:00', fecha: '20:00' },
  sab: { abre: '09:00', fecha: '18:00' },
}

/** Segunda a sábado, como a jornada do único barbeiro da El Guardians. */
const TRABALHA = [1, 2, 3, 4, 5, 6]

const spo = (iso: string) => new Date(`${iso}-03:00`)

/** Catorze dias a partir de `de`, todos com a mesma contagem. */
function janela(de: string, livres: number): ContagemDoDia[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${de}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return { dia: d.toISOString().slice(0, 10), livres }
  })
}

describe('montarFaixa', () => {
  // 2026-09-14 é uma segunda-feira.
  it('rotula os dois primeiros por posicao, nao por nome', () => {
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 5),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(faixa.map((d) => d.rotulo).slice(0, 5)).toEqual(['HOJE', 'AMANHÃ', 'QUA', 'QUI', 'SEX'])
    expect(faixa[0].porExtenso).toBe('hoje')
    expect(faixa[1].porExtenso).toBe('amanhã')
    expect(faixa[2].porExtenso).toBe('quarta, 16/09')
    expect(faixa[0].numero).toBe(14)
  })

  it('dia de folga e FECHADO, mesmo com a contagem em zero como qualquer outro', () => {
    // `horarios_livres` devolve zero para folga E para agenda cheia. Sem cruzar
    // com o horário de funcionamento, a faixa marcaria domingo como "lotado" e
    // a pessoa voltaria amanhã achando que só estava cheio.
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 0),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })
    const domingo = faixa.find((d) => d.rotulo === 'DOM')
    expect(domingo?.estado).toBe('fechado')
    expect(faixa.find((d) => d.rotulo === 'QUA')?.estado).toBe('lotado')
  })

  it('salao fechado no dia PESA MAIS que a jornada do barbeiro', () => {
    // O caso que o teste do domingo acima não pegava, porque lá a jornada
    // também excluía o domingo — os dois sinais concordavam, e um deles podia
    // sumir sem ninguém notar (conferido: removendo a checagem do horário de
    // funcionamento, nenhum teste falhava).
    //
    // É configuração real: o dono marca a jornada do barbeiro nos sete dias e
    // depois fecha o domingo no horário do salão. `horarios_livres` respeita o
    // horário do SALÃO e devolve zero — então, sem cruzar com ele, a faixa
    // diria "lotado" num dia em que a barbearia simplesmente não abre, e a
    // pessoa voltaria no domingo achando que era só agenda cheia.
    const trabalhaTodoDia = [0, 1, 2, 3, 4, 5, 6]
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 0),
      horario: HORARIO,
      diasDeTrabalho: trabalhaTodoDia,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(faixa.find((d) => d.rotulo === 'DOM')?.estado).toBe('fechado')
    expect(faixa.find((d) => d.rotulo === 'QUA')?.estado).toBe('lotado')
  })

  it('dia sem ninguem de jornada e FECHADO, nao lotado', () => {
    // A barbearia abre no papel, mas nenhum barbeiro trabalha no sábado.
    const semSabado = [1, 2, 3, 4, 5]
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 0),
      horario: HORARIO,
      diasDeTrabalho: semSabado,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(faixa.find((d) => d.rotulo === 'SÁB')?.estado).toBe('fechado')
  })

  it('so HOJE vira "encerrado" depois da hora de fechar', () => {
    // Segunda 21h: hoje já encerrou, mas os outros dias sem vaga continuam
    // "lotado" — o relógio de hoje não fala pelo resto da semana.
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 0),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T21:00:00'),
    })
    expect(faixa[0].estado).toBe('encerrado')
    expect(faixa[1].estado).toBe('lotado')
  })

  it('dia com vaga e LIVRE mesmo depois do expediente de hoje', () => {
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 7),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T21:00:00'),
    })
    expect(faixa[1].estado).toBe('livre')
    expect(faixa[1].livres).toBe(7)
  })

  it('marca hoje pelo dia da barbearia', () => {
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 3),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(faixa.filter((d) => d.ehHoje).map((d) => d.data)).toEqual(['2026-09-14'])
  })
})

describe('montarFaixa com o aparelho em outro fuso', () => {
  const original = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'UTC'
  })
  afterAll(() => {
    process.env.TZ = original
  })

  it('nao adianta o "hoje" da faixa quando o dia ja virou no aparelho', () => {
    // 2026-09-14T23:30 em São Paulo é 2026-09-15T02:30 em UTC. Lido pelo
    // aparelho, "hoje" seria a terça — e a faixa marcaria o dia errado como
    // hoje, deixando a segunda (que ainda é hoje na barbearia) rotulada como
    // um dia passado.
    const faixa = montarFaixa({
      dias: janela('2026-09-14', 4),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: new Date('2026-09-15T02:30:00Z'),
    })
    expect(faixa.filter((d) => d.ehHoje).map((d) => d.data)).toEqual(['2026-09-14'])
  })
})

describe('proximoDiaComVaga', () => {
  const faixa = () =>
    montarFaixa({
      dias: [
        { dia: '2026-09-14', livres: 0 },
        { dia: '2026-09-15', livres: 0 },
        { dia: '2026-09-16', livres: 4 },
        { dia: '2026-09-17', livres: 9 },
      ],
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })

  it('acha o primeiro dia livre depois do escolhido', () => {
    expect(proximoDiaComVaga(faixa(), '2026-09-14')?.data).toBe('2026-09-16')
  })

  it('nao devolve o proprio dia escolhido', () => {
    // Senão o botão "ver quarta" apareceria na tela da quarta, sem sair do lugar.
    expect(proximoDiaComVaga(faixa(), '2026-09-16')?.data).toBe('2026-09-17')
  })

  it('devolve null quando nao ha mais nenhum', () => {
    // E aí a frase tem de mandar falar com a barbearia, em vez de prometer um
    // dia que não existe.
    expect(proximoDiaComVaga(faixa(), '2026-09-17')).toBeNull()
  })

  it('pula dia fechado ao procurar', () => {
    const comDomingo = montarFaixa({
      dias: [
        { dia: '2026-09-18', livres: 0 },
        { dia: '2026-09-19', livres: 0 },
        { dia: '2026-09-20', livres: 0 }, // domingo: folga, contagem zero
        { dia: '2026-09-21', livres: 6 },
      ],
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-18T10:00:00'),
    })
    expect(proximoDiaComVaga(comDomingo, '2026-09-18')?.data).toBe('2026-09-21')
  })
})

describe('temAlgumDiaLivre', () => {
  it('separa a janela que tem saida da que nao tem', () => {
    const cheia = montarFaixa({
      dias: janela('2026-09-14', 0),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(temAlgumDiaLivre(cheia)).toBe(false)
    const comVaga = montarFaixa({
      dias: janela('2026-09-14', 1),
      horario: HORARIO,
      diasDeTrabalho: TRABALHA,
      agora: spo('2026-09-14T10:00:00'),
    })
    expect(temAlgumDiaLivre(comVaga)).toBe(true)
  })
})
