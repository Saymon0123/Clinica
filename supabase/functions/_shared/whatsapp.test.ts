import { describe, expect, it } from 'vitest'
import { linkWhatsApp, numeroParaWhatsApp } from './whatsapp'

/**
 * O número do WhatsApp, montado por uma regra só.
 *
 * O caso que motivou é real e está em produção: o telefone da El Guardians é
 * `(41) 9847-2975` — dez dígitos, sem o nono. O botão "Falar com a barbearia"
 * aparece normalmente e não leva a lugar nenhum, porque o número montado não
 * existe no WhatsApp. Ninguém percebeu: link quebrado não dá erro, só não abre.
 *
 * Estes testes são gêmeos dos de `src/lib/telefone.test.ts`. As edges não
 * importam de `src/`, então a regra vive nos dois lugares — e os dois têm os
 * MESMOS casos, para divergirem de forma barulhenta em vez de silenciosa.
 */
describe('numeroParaWhatsApp', () => {
  it('poe o nono digito no celular que veio sem ele', () => {
    // O caso da El Guardians, em produção desde sempre.
    expect(numeroParaWhatsApp('(41) 9847-2975')).toBe('5541998472975')
    expect(numeroParaWhatsApp('41 8727-5895')).toBe('5541987275895')
  })

  it('nao mexe em quem ja tem o nono', () => {
    expect(numeroParaWhatsApp('(41) 98727-5895')).toBe('5541987275895')
    expect(numeroParaWhatsApp('41987275895')).toBe('5541987275895')
  })

  it('NAO inventa o nono num telefone fixo', () => {
    // WhatsApp Business roda em fixo. Pôr um 9 aqui quebraria justamente quem
    // cadastrou certo. 2 a 5 depois do DDD é fixo; 6 a 9 é celular.
    expect(numeroParaWhatsApp('(41) 3344-5566')).toBe('554133445566')
    expect(numeroParaWhatsApp('(11) 2222-3333')).toBe('551122223333')
  })

  it('completa o DDI de quem veio so com o numero local', () => {
    expect(numeroParaWhatsApp('41987275895')).toBe('5541987275895')
  })

  it('nao duplica o DDI de quem ja veio com ele', () => {
    // O defeito do nó do n8n: '55' + digitos, incondicional, gerava 5555...
    expect(numeroParaWhatsApp('5541987275895')).toBe('5541987275895')
    expect(numeroParaWhatsApp('+55 (41) 98727-5895')).toBe('5541987275895')
  })

  it('nao confunde DDD 55 com DDI 55', () => {
    // Santa Maria (RS) é DDD 55. Um fixo de lá, sem DDI, tem 10 dígitos e
    // começa com "55" — tirar os dois primeiros o transformaria em outro
    // número. Só se descasca o DDI quando o total tem 12 ou 13 dígitos.
    expect(numeroParaWhatsApp('5533445566')).toBe('555533445566')
  })

  it('devolve null quando nao da para afirmar que e um telefone', () => {
    expect(numeroParaWhatsApp('')).toBeNull()
    expect(numeroParaWhatsApp(null)).toBeNull()
    expect(numeroParaWhatsApp(undefined)).toBeNull()
    expect(numeroParaWhatsApp('9999')).toBeNull()
    expect(numeroParaWhatsApp('sem digito nenhum')).toBeNull()
    expect(numeroParaWhatsApp('5541987275895123')).toBeNull()
  })
})

describe('linkWhatsApp', () => {
  it('monta o link a partir do numero ja normalizado', () => {
    expect(linkWhatsApp('(41) 9847-2975')).toBe('https://wa.me/5541998472975')
  })

  it('devolve null em vez de um link que nao abre', () => {
    // Preferir nenhum botão a um botão que não leva a lugar nenhum: o segundo
    // faz a pessoa achar que tentou falar com a barbearia.
    expect(linkWhatsApp('9999')).toBeNull()
  })
})
