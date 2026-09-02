import { describe, expect, it } from 'vitest'
import { classificarTelefone, formatarTelefone, linkWhatsApp, somenteDigitos } from './telefone'

describe('formatarTelefone', () => {
  // O caso que motivou a correção: a aba WEB mostrava "+5 (54) 18727-5895".
  it('formata numero antigo de 8 digitos com DDI', () => {
    expect(formatarTelefone('554187275895')).toBe('+55 (41) 8727-5895')
  })

  it('formata celular de 9 digitos com DDI', () => {
    expect(formatarTelefone('5541987275895')).toBe('+55 (41) 98727-5895')
  })

  it('formata sem DDI, nos dois tamanhos', () => {
    expect(formatarTelefone('4187275895')).toBe('(41) 8727-5895')
    expect(formatarTelefone('41987275895')).toBe('(41) 98727-5895')
  })

  it('ignora a pontuacao que ja vier no valor', () => {
    expect(formatarTelefone('+55 (41) 98727-5895')).toBe('+55 (41) 98727-5895')
    expect(formatarTelefone('41 8727-5895')).toBe('(41) 8727-5895')
  })

  // Melhor devolver como veio do que inventar DDD a partir de um valor
  // incompleto — o dono reconhece o próprio dado, mesmo mal formatado.
  it('devolve como veio quando e curto demais para ter DDD', () => {
    expect(formatarTelefone('987275895')).toBe('987275895')
    expect(formatarTelefone('')).toBe('')
    expect(formatarTelefone('sem numero')).toBe('sem numero')
  })

  // Limite conhecido e aceito: a função assume número brasileiro. Com 12
  // dígitos não há como distinguir 55+DDD+8 de um DDI de 3 dígitos +DDD+7 —
  // a informação simplesmente não está no valor. Como todo cliente chega pelo
  // WhatsApp de uma barbearia brasileira, o palpite de DDI 55 é o certo.
  it('assume numero brasileiro quando o tamanho e ambiguo', () => {
    expect(formatarTelefone('351411234567')).toBe('+35 (14) 1123-4567')
  })
})

describe('classificarTelefone', () => {
  // Cliente sem WhatsApp existe e continua entrando no cadastro: campo em
  // branco não é erro, é ausência de dado.
  it('trata campo em branco como vazio', () => {
    expect(classificarTelefone('')).toBe('vazio')
    expect(classificarTelefone('   ')).toBe('vazio')
    expect(classificarTelefone(null)).toBe('vazio')
    expect(classificarTelefone(undefined)).toBe('vazio')
  })

  // Estes limites são os mesmos da CHECK `clients_telefone_valido` e da
  // `garantir_cliente` (migration 0128). Mudar um lado sem o outro faz o erro
  // voltar como 23514 do servidor, em inglês, em vez de aparecer no campo.
  it('aceita de 10 a 13 digitos e recusa fora da faixa', () => {
    expect(classificarTelefone('987275895')).toBe('invalido')
    expect(classificarTelefone('4133445566')).toBe('valido')
    expect(classificarTelefone('5541987275895')).toBe('valido')
    expect(classificarTelefone('55554187275895')).toBe('invalido')
  })

  // O balcão digita com máscara e o agente do WhatsApp manda só dígitos; os
  // dois têm de passar pela mesma régua.
  it('ignora a mascara ao contar os digitos', () => {
    expect(classificarTelefone('(41) 98727-5895')).toBe('valido')
    expect(classificarTelefone('+55 (41) 98727-5895')).toBe('valido')
  })

  // Texto sem dígito nenhum é 'invalido', nunca 'vazio': o dono digitou alguma
  // coisa ali. Engolir isso como "sem telefone" apagaria em silêncio o que ele
  // quis registrar — salvaria sem aviso, e ele só descobriria o sumiço quando o
  // cliente não recebesse lembrete nenhum.
  it('recusa texto sem digito em vez de tratar como vazio', () => {
    expect(classificarTelefone('lkasdnfoabi')).toBe('invalido')
    expect(classificarTelefone('não tem')).toBe('invalido')
  })
})

// Daqui para baixo são testes de caracterização: não afirmam que este é o
// comportamento ideal, só prendem o comportamento de hoje. Quem for mexer
// descobre na hora que mudou algo de que outra tela depende.
describe('somenteDigitos', () => {
  it('mantem apenas os digitos, descartando mascara e sinais', () => {
    expect(somenteDigitos('(41) 98727-5895')).toBe('41987275895')
    expect(somenteDigitos('+55 41 98727 5895')).toBe('5541987275895')
  })

  it('devolve string vazia quando nao ha digito algum', () => {
    expect(somenteDigitos('')).toBe('')
    expect(somenteDigitos('lkasdnfoabi')).toBe('')
  })
})

describe('linkWhatsApp', () => {
  // 10 e 11 dígitos são número local: sem o 55 na frente o wa.me abre conversa
  // com outro país.
  it('completa o DDI 55 no numero local', () => {
    expect(linkWhatsApp('4133445566')).toBe('https://wa.me/554133445566')
    expect(linkWhatsApp('(41) 98727-5895')).toBe('https://wa.me/5541987275895')
  })

  it('deixa intacto quem ja veio com DDI', () => {
    expect(linkWhatsApp('554187275895')).toBe('https://wa.me/554187275895')
    expect(linkWhatsApp('5541987275895')).toBe('https://wa.me/5541987275895')
  })

  // O null é contrato de tela: o ClientDetailModal usa exatamente ele para
  // decidir entre link clicável e texto puro. Devolver string aqui faria a
  // ficha oferecer uma conversa que o WhatsApp não consegue abrir.
  it('devolve null fora da faixa e quando nao ha digito', () => {
    expect(linkWhatsApp('987275895')).toBeNull()
    expect(linkWhatsApp('55554187275895')).toBeNull()
    expect(linkWhatsApp('lkasdnfoabi')).toBeNull()
    expect(linkWhatsApp('')).toBeNull()
  })
})
