import { afterEach, describe, expect, it, vi } from 'vitest'
import { idDaRequisicao, marcarSalao, registrarFim, type ContextoDaRequisicao } from './log'

/**
 * O inquilino no log (achado M3, redesenhado depois de medir).
 *
 * O que se quer provar aqui não é formatação: é que a linha de fim **não
 * mente**. Ela só serve para responder "o que aconteceu com a barbearia X", e
 * uma linha que atribui a chamada à barbearia errada é pior que linha nenhuma —
 * manda quem está investigando para o lado errado, com confiança.
 */
const req = (headers: Record<string, string>) => new Request('https://x/y', { headers })

afterEach(() => vi.restoreAllMocks())

describe('marcarSalao', () => {
  it('anota o salao quando a chamada e de um so', () => {
    const ctx: ContextoDaRequisicao = {}
    marcarSalao(ctx, 'salao-a')
    expect(ctx.salao).toBe('salao-a')
  })

  it('repetir o mesmo salao nao transforma em varios', () => {
    // O caso do laço: o `cobrar-uso` percorre faturas, e várias podem ser da
    // mesma barbearia. Se isso virasse 'varios', o log perderia o id justamente
    // no caso mais comum.
    const ctx: ContextoDaRequisicao = {}
    marcarSalao(ctx, 'salao-a')
    marcarSalao(ctx, 'salao-a')
    marcarSalao(ctx, 'salao-a')
    expect(ctx.salao).toBe('salao-a')
  })

  it('dois salaos diferentes viram varios, e nao o ultimo', () => {
    // O coração do teste. Ficar com o último seria uma mentira plausível: a
    // linha pareceria certa e atribuiria a rodada inteira a quem só entrou no
    // fim dela.
    const ctx: ContextoDaRequisicao = {}
    marcarSalao(ctx, 'salao-a')
    marcarSalao(ctx, 'salao-b')
    expect(ctx.salao).toBe('varios')
  })

  it('depois de virar varios, nao volta a ser um salao so', () => {
    const ctx: ContextoDaRequisicao = {}
    marcarSalao(ctx, 'salao-a')
    marcarSalao(ctx, 'salao-b')
    marcarSalao(ctx, 'salao-c')
    marcarSalao(ctx, 'salao-a')
    expect(ctx.salao).toBe('varios')
  })

  it('nulo, indefinido e vazio nao apagam o que ja se sabia', () => {
    // Acontece de verdade: `salon_por_phone_number_id` devolve null para o
    // número central. Se isso zerasse a anotação, a mensagem seguinte da mesma
    // barbearia perderia o dono.
    const ctx: ContextoDaRequisicao = {}
    marcarSalao(ctx, 'salao-a')
    marcarSalao(ctx, null)
    marcarSalao(ctx, undefined)
    marcarSalao(ctx, '')
    expect(ctx.salao).toBe('salao-a')
  })
})

describe('idDaRequisicao', () => {
  it('prefere o sb-request-id, que e o mesmo que aparece no log', () => {
    expect(idDaRequisicao(req({ 'sb-request-id': 'abc', 'x-deno-execution-id': 'xyz' }))).toBe('abc')
  })

  it('cai para o x-deno-execution-id quando o primeiro nao vem', () => {
    expect(idDaRequisicao(req({ 'x-deno-execution-id': 'xyz' }))).toBe('xyz')
  })

  it('devolve null em vez de inventar um id', () => {
    // Um id inventado não casa com coisa nenhuma e *parece* que casa — é o tipo
    // de dado que faz perder uma hora numa consulta que nunca ia dar em nada.
    expect(idDaRequisicao(req({}))).toBeNull()
  })
})

describe('registrarFim', () => {
  it('escreve salao, status, duracao e requisicao na mesma linha', () => {
    const escrito = vi.spyOn(console, 'log').mockImplementation(() => {})
    registrarFim('agenda-publica', { salao: 'salao-a' }, 200, 42, 'req-1')
    expect(escrito).toHaveBeenCalledWith('fim agenda-publica status=200 ms=42 salao=salao-a req=req-1')
  })

  it('usa hifen quando o salao nao chegou a ser conhecido', () => {
    // Não é enfeite: é a diferença entre "a função não soube" e "a função
    // esqueceu". O hífen diz a primeira coisa.
    const escrito = vi.spyOn(console, 'log').mockImplementation(() => {})
    registrarFim('accept-invite', {}, 404, 7, null)
    expect(escrito).toHaveBeenCalledWith('fim accept-invite status=404 ms=7 salao=- req=-')
  })

  it('sai no nivel de erro quando levantou, para o filtro do painel achar', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    registrarFim('cobrar-uso', { salao: 'varios' }, 'erro', 1200, 'req-2')
    expect(erro).toHaveBeenCalledWith('fim cobrar-uso status=erro ms=1200 salao=varios req=req-2')
  })

  it('500 tambem sai como erro, mesmo sem ter levantado', () => {
    // A função que trata o próprio erro e responde 500 some do filtro de nível
    // se a linha sair como `log` — e é exatamente ela que se procura às 3h.
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    registrarFim('whatsapp', { salao: 'salao-a' }, 500, 30, 'req-3')
    expect(erro).toHaveBeenCalledWith('fim whatsapp status=500 ms=30 salao=salao-a req=req-3')
  })

  it('4xx nao e erro nosso: sai como log comum', () => {
    const escrito = vi.spyOn(console, 'log').mockImplementation(() => {})
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    registrarFim('asaas', { salao: 'salao-a' }, 400, 5, 'req-4')
    expect(escrito).toHaveBeenCalledTimes(1)
    expect(erro).not.toHaveBeenCalled()
  })
})
