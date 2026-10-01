import { describe, it, expect } from 'vitest'
import { mapearColunas, normalizar } from './colunasDoArquivo'

describe('mapearColunas', () => {
  it('casa os quatro títulos simples e não ignora nada', () => {
    const m = mapearColunas(['Nome', 'Telefone', 'Aniversário', 'Observação'])
    expect(m.indices).toEqual({ nome: 0, telefone: 1, aniversario: 2, observacao: 3 })
    expect(m.ignoradas).toEqual([])
  })

  it('DIZ, pelo nome, as colunas que ignorou', () => {
    // O export de sistema antigo, que é o caso que o item 4 existe para
    // resolver: antes isto sumia inteiro sem uma palavra.
    const m = mapearColunas(['Nome', 'Email', 'CPF', 'Telefone', 'Endereço', 'Total gasto'])
    expect(m.ignoradas).toEqual(['Email', 'CPF', 'Endereço', 'Total gasto'])
    expect(m.indices.nome).toBe(0)
    expect(m.indices.telefone).toBe(3)
  })

  it('reconhece "Nome Completo", que antes virava "falta a coluna Nome"', () => {
    const m = mapearColunas(['Nome Completo', 'Celular'])
    expect(m.indices.nome).toBe(0)
    expect(m.indices.telefone).toBe(1)
    expect(m.ignoradas).toEqual([])
  })

  it('reconhece "Telefone 1" e "Data Nascimento"', () => {
    const m = mapearColunas(['Nome do Cliente', 'Telefone 1', 'Data Nascimento'])
    expect(m.indices).toMatchObject({ nome: 0, telefone: 1, aniversario: 2 })
  })

  it('NÃO casa "Sobrenome" com nome: o palpite começa no título, não no meio', () => {
    // `includes` cru casaria, e o sobrenome entraria como nome do cliente.
    const m = mapearColunas(['Sobrenome', 'Telefone'])
    expect(m.indices.nome).toBe(-1)
    expect(m.ignoradas).toContain('Sobrenome')
  })

  it('o título exato vence o palpite, mesmo vindo depois no arquivo', () => {
    // Sem a passada exata rodar primeiro, "Nome Fantasia" (coluna 0) tomaria o
    // nome e a coluna "Nome" de verdade iria para as ignoradas.
    const m = mapearColunas(['Nome Fantasia', 'Nome'])
    expect(m.indices.nome).toBe(1)
    expect(m.ignoradas).toEqual(['Nome Fantasia'])
  })

  it('com dois candidatos, vale a ordem de preferência e o outro é DITO', () => {
    const m = mapearColunas(['Nome', 'Celular', 'Telefone'])
    expect(m.indices.telefone).toBe(2)
    expect(m.ignoradas).toEqual(['Celular'])
  })

  it('uma coluna serve a um campo só', () => {
    const m = mapearColunas(['Nome', 'Nome'])
    expect(m.indices.nome).toBe(0)
    expect(m.ignoradas).toEqual(['Nome'])
  })

  it('coluna sem título é contada, não nomeada', () => {
    // O ponto e vírgula sobrando no fim de cada linha do export. "Ignorei a
    // coluna ''" não ajudaria ninguém.
    const m = mapearColunas(['Nome', 'Telefone', '', '  '])
    expect(m.semTitulo).toBe(2)
    expect(m.ignoradas).toEqual([])
  })

  it('devolve o que foi usado para quê, para a tela poder mostrar', () => {
    const m = mapearColunas(['Nome Completo', 'Email', 'WhatsApp'])
    expect(m.usadas).toEqual([
      { campo: 'nome', cabecalho: 'Nome Completo' },
      { campo: 'telefone', cabecalho: 'WhatsApp' },
    ])
  })

  it('o cabeçalho devolvido é o do ARQUIVO, não o normalizado', () => {
    // O dono tem de reconhecer o próprio título na tela: mostrar "nome completo"
    // em minúscula sem acento faria ele duvidar se é a mesma coluna.
    const m = mapearColunas(['  NOME COMPLETO  ', 'Observações'])
    expect(m.usadas[0].cabecalho).toBe('NOME COMPLETO')
    expect(m.usadas[1].cabecalho).toBe('Observações')
  })

  it('arquivo sem nenhuma coluna conhecida não acha nada e diz tudo', () => {
    const m = mapearColunas(['Código', 'Valor', 'Data da compra'])
    expect(m.indices).toEqual({ nome: -1, telefone: -1, aniversario: -1, observacao: -1 })
    expect(m.ignoradas).toEqual(['Código', 'Valor', 'Data da compra'])
  })

  it('cabeçalho vazio de verdade não quebra', () => {
    const m = mapearColunas([])
    expect(m.indices.nome).toBe(-1)
    expect(m.ignoradas).toEqual([])
    expect(m.semTitulo).toBe(0)
  })
})

describe('normalizar', () => {
  it('tira acento, caixa e espaço das pontas', () => {
    expect(normalizar('  Aniversário ')).toBe('aniversario')
    expect(normalizar('OBSERVAÇÕES')).toBe('observacoes')
  })
})
