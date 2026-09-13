import { afterEach, describe, expect, it, vi } from 'vitest'
import { esquecer, guardar, lerGuardados, tokensAEsquecer } from './guardados'

const SALAO = '4748d5b4-9184-4a70-add9-02c1dda88f12'
const OUTRO = '00000000-1111-2222-3333-444444444444'
const T1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const T2 = '11111111-2222-3333-4444-555555555555'
const T3 = '99999999-8888-7777-6666-555555555555'

const AGORA = new Date('2026-09-13T15:00:00-03:00')
/** Um horário daqui a N horas, em ISO. */
const daqui = (h: number) => new Date(AGORA.getTime() + h * 3600_000).toISOString()

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('guardar e ler', () => {
  it('guarda e devolve', () => {
    guardar(SALAO, { token: T1, inicio: daqui(20) }, AGORA)
    expect(lerGuardados(SALAO, AGORA).map((h) => h.token)).toEqual([T1])
  })

  it('separa por barbearia', () => {
    // A pessoa pode cortar em duas. O cartão de uma não tem nada que fazer na
    // página da outra.
    guardar(SALAO, { token: T1, inicio: daqui(20) }, AGORA)
    guardar(OUTRO, { token: T2, inicio: daqui(30) }, AGORA)
    expect(lerGuardados(SALAO, AGORA).map((h) => h.token)).toEqual([T1])
    expect(lerGuardados(OUTRO, AGORA).map((h) => h.token)).toEqual([T2])
  })

  it('ordena do mais proximo para o mais distante', () => {
    guardar(SALAO, { token: T1, inicio: daqui(50) }, AGORA)
    guardar(SALAO, { token: T2, inicio: daqui(20) }, AGORA)
    expect(lerGuardados(SALAO, AGORA).map((h) => h.token)).toEqual([T2, T1])
  })

  it('token repetido nao duplica, e a hora nova vale', () => {
    // Remarcar mantém o mesmo token e só muda a hora (etapa 4).
    guardar(SALAO, { token: T1, inicio: daqui(20) }, AGORA)
    guardar(SALAO, { token: T1, inicio: daqui(40) }, AGORA)
    const lista = lerGuardados(SALAO, AGORA)
    expect(lista).toHaveLength(1)
    expect(lista[0].inicio).toBe(daqui(40))
  })

  it('guarda no maximo cinco, mantendo os mais proximos', () => {
    for (const [i, t] of [T1, T2, T3].entries()) guardar(SALAO, { token: t, inicio: daqui(10 + i) }, AGORA)
    for (let i = 0; i < 4; i++) {
      guardar(SALAO, { token: `aaaaaaaa-bbbb-cccc-dddd-00000000000${i}`, inicio: daqui(100 + i) }, AGORA)
    }
    const lista = lerGuardados(SALAO, AGORA)
    expect(lista).toHaveLength(5)
    expect(lista.map((h) => h.token).slice(0, 3)).toEqual([T1, T2, T3])
  })
})

describe('esquecer o que nao vale mais', () => {
  it('joga fora o que ja comecou', () => {
    // Horário que já começou não tem o que remarcar nem cancelar, e a lista
    // cresceria para sempre no aparelho de quem corta toda semana.
    guardar(SALAO, { token: T1, inicio: daqui(-2) }, AGORA)
    guardar(SALAO, { token: T2, inicio: daqui(5) }, AGORA)
    expect(lerGuardados(SALAO, AGORA).map((h) => h.token)).toEqual([T2])
  })

  it('a limpeza e GRAVADA, nao so filtrada na leitura', () => {
    guardar(SALAO, { token: T1, inicio: daqui(-2) }, AGORA)
    lerGuardados(SALAO, AGORA)
    expect(localStorage.getItem(`clubcut:horarios:${SALAO}`)).toBeNull()
  })

  it('esquecer tira um sem mexer nos outros', () => {
    // Chamado quando o servidor diz que aquele horário não está mais de pé.
    // Sem isto o cartão insistiria num horário morto e a pessoa apareceria na
    // barbearia confiando nele.
    guardar(SALAO, { token: T1, inicio: daqui(10) }, AGORA)
    guardar(SALAO, { token: T2, inicio: daqui(20) }, AGORA)
    esquecer(SALAO, T1, AGORA)
    expect(lerGuardados(SALAO, AGORA).map((h) => h.token)).toEqual([T2])
  })
})

describe('tokensAEsquecer — a regra que apagaria horarios por um soluco de rede', () => {
  const guardados = [
    { token: T1, inicio: daqui(10) },
    { token: T2, inicio: daqui(20) },
  ]

  it('NAO esquece nada quando o servidor nao respondeu', () => {
    // O caso perigoso. Rede caiu, 429, 500 -> `null`. Tratar isso como "nenhum
    // esta de pe" apagaria os horarios da pessoa PARA SEMPRE, e ela so
    // descobriria ao chegar na barbearia.
    expect(tokensAEsquecer(guardados, null)).toEqual([])
  })

  it('esquece o que o servidor NAO confirmou como de pe', () => {
    expect(
      tokensAEsquecer(guardados, [
        { token: T1, status: 'agendado' },
        { token: T2, status: 'cancelado' },
      ]),
    ).toEqual([T2])
  })

  it('esquece o token que sumiu da resposta (agendamento apagado)', () => {
    expect(tokensAEsquecer(guardados, [{ token: T1, status: 'confirmado' }])).toEqual([T2])
  })

  it('esquece concluido e faltou, nao so cancelado', () => {
    // Lista positiva: status novo no banco nao vira "de pe" por esquecimento.
    expect(
      tokensAEsquecer(guardados, [
        { token: T1, status: 'concluido' },
        { token: T2, status: 'faltou' },
      ]),
    ).toEqual([T1, T2])
  })

  it('resposta VAZIA e diferente de resposta AUSENTE', () => {
    // Lista vazia é o servidor dizendo "nenhum desses vale". Null é ele não
    // tendo dito nada. A diferença é o que separa limpar de destruir.
    expect(tokensAEsquecer(guardados, [])).toEqual([T1, T2])
    expect(tokensAEsquecer(guardados, null)).toEqual([])
  })
})

describe('lixo no storage nao derruba a pagina', () => {
  it('devolve vazio com JSON quebrado, tipo errado ou token invalido', () => {
    for (const lixo of ['{', 'null', '"texto"', '{"a":1}', '[{"token":"nao-e-uuid","inicio":"x"}]']) {
      localStorage.setItem(`clubcut:horarios:${SALAO}`, lixo)
      expect(lerGuardados(SALAO, AGORA), lixo).toEqual([])
    }
  })

  it('descarta item com data invalida', () => {
    localStorage.setItem(
      `clubcut:horarios:${SALAO}`,
      JSON.stringify([{ token: T1, inicio: 'amanha de manha' }]),
    )
    expect(lerGuardados(SALAO, AGORA)).toEqual([])
  })

  it('recusa token fora do formato ao guardar', () => {
    // O que sai daqui vira requisição. Lixo guardado hoje é 400 amanhã.
    guardar(SALAO, { token: 'sql injection', inicio: daqui(10) }, AGORA)
    expect(lerGuardados(SALAO, AGORA)).toEqual([])
  })
})

describe('sem localStorage a tela continua de pe', () => {
  // Aba anônima, cookies bloqueados, cota estourada: o ACESSO levanta exceção,
  // não devolve nulo. Exceção não tratada aqui derruba a página pública
  // inteira — a única porta de quem está de pé no balcão.
  it('ler nao estoura quando o storage lanca', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado')
    })
    expect(() => lerGuardados(SALAO, AGORA)).not.toThrow()
    expect(lerGuardados(SALAO, AGORA)).toEqual([])
  })

  it('guardar nao estoura quando o storage lanca', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota estourada')
    })
    expect(() => guardar(SALAO, { token: T1, inicio: daqui(10) }, AGORA)).not.toThrow()
  })
})
