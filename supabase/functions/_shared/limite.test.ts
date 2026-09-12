import { afterEach, describe, expect, it, vi } from 'vitest'
import { ipDe, taxaExcedida } from './limite'

/**
 * O limitador de taxa (achado M10).
 *
 * O que importa provar aqui é o comportamento na FALHA, porque é o único que
 * nunca aparece em teste manual: o limitador quebra uma vez por ano, e é nessa
 * vez que a decisão de "deixa passar" ou "bloqueia" vale dinheiro ou senha.
 */
const req = (headers: Record<string, string>) => new Request('https://x/y', { headers })

/** Um cliente que responde o que o teste mandar — sem tocar em banco nenhum. */
function adminFalso(resposta: { data?: unknown; error?: unknown }) {
  return { rpc: () => Promise.resolve({ data: resposta.data ?? null, error: resposta.error ?? null }) } as never
}

afterEach(() => vi.restoreAllMocks())

describe('ipDe', () => {
  it('pega o primeiro da lista do x-forwarded-for, que e o cliente original', () => {
    expect(ipDe(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }))).toBe('203.0.113.7')
  })

  it('tira o espaco em volta', () => {
    expect(ipDe(req({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7')
  })

  it('cai no cf-connecting-ip quando nao ha forwarded-for', () => {
    expect(ipDe(req({ 'cf-connecting-ip': '198.51.100.4' }))).toBe('198.51.100.4')
  })

  it('sem cabecalho nenhum devolve sem-ip, e nao vazio nem nulo', () => {
    // A string entra na CHAVE do limite. Se voltasse '' ou null, a chave viraria
    // `admin:` e todo mundo sem IP cairia no mesmo balde por acidente em vez de
    // por decisão — e pior, `chave:undefined` em alguns caminhos.
    expect(ipDe(req({}))).toBe('sem-ip')
  })
})

describe('taxaExcedida, no caminho normal', () => {
  it('estourou o limite quando o banco diz true', async () => {
    expect(await taxaExcedida(adminFalso({ data: true }), 'k', 5, 60, 'bloqueia')).toBe(true)
  })

  it('nao estourou quando o banco diz false', async () => {
    expect(await taxaExcedida(adminFalso({ data: false }), 'k', 5, 60, 'bloqueia')).toBe(false)
  })

  it('so `true` conta como estourado — nulo nao bloqueia por acidente', async () => {
    expect(await taxaExcedida(adminFalso({ data: null }), 'k', 5, 60, 'deixa-passar')).toBe(false)
  })
})

describe('taxaExcedida, quando o proprio limitador falha', () => {
  it('bloqueia quando a porta guarda senha, dinheiro ou um laco caro', async () => {
    // O coração do M10. Antes, TODAS as portas deixavam passar aqui — inclusive
    // a que protege a senha do painel administrativo contra força bruta, e a que
    // impede dois auto-respondedores de conversarem num laço que a Meta cobra.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await taxaExcedida(adminFalso({ error: new Error('banco fora') }), 'k', 5, 60, 'bloqueia')).toBe(true)
  })

  it('deixa passar quando travar significa o cliente final nao conseguir marcar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await taxaExcedida(adminFalso({ error: new Error('banco fora') }), 'k', 5, 60, 'deixa-passar')).toBe(false)
  })

  it('o log diz QUAL porta ficou desprotegida, e sob qual politica', async () => {
    // Sem a chave no log não dá para saber, depois, o que esteve aberto enquanto
    // o limitador esteve fora — que é a primeira pergunta de quem investiga.
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    await taxaExcedida(adminFalso({ error: new Error('banco fora') }), 'admin:203.0.113.7', 20, 600, 'bloqueia')
    expect(erro.mock.calls[0][0]).toContain('chave=admin:203.0.113.7')
    expect(erro.mock.calls[0][0]).toContain('politica=bloqueia')
  })
})
