import { describe, expect, it } from 'vitest'
import { buildCsv, parseCsv } from './csv'

describe('buildCsv', () => {
  it('separa com ponto e vírgula e envolve todo campo em aspas', () => {
    expect(buildCsv(['nome', 'telefone'], [['Ana', '41999998888']])).toBe(
      '"nome";"telefone"\r\n"Ana";"41999998888"',
    )
  })

  it('duplica aspas internas em vez de quebrar o campo', () => {
    expect(buildCsv(['obs'], [['cliente dito "VIP"']])).toBe('"obs"\r\n"cliente dito ""VIP"""')
  })

  it('trata null e undefined como campo vazio', () => {
    expect(buildCsv(['a', 'b'], [[null, undefined]])).toBe('"a";"b"\r\n"";""')
  })

  it('mantém ponto e vírgula dentro do valor sem virar separador', () => {
    const csv = buildCsv(['obs'], [['corte; barba']])
    expect(parseCsv(csv).rows).toEqual([['corte; barba']])
  })
})

describe('parseCsv', () => {
  it('usa a primeira linha como cabeçalho', () => {
    const { headers, rows } = parseCsv('nome;telefone\nAna;41999998888')
    expect(headers).toEqual(['nome', 'telefone'])
    expect(rows).toEqual([['Ana', '41999998888']])
  })

  it('detecta vírgula quando não há ponto e vírgula no cabeçalho', () => {
    expect(parseCsv('nome,telefone\nAna,41999998888').rows).toEqual([['Ana', '41999998888']])
  })

  it('remove o BOM que o Excel escreve', () => {
    expect(parseCsv('﻿nome;telefone\nAna;41999998888').headers).toEqual(['nome', 'telefone'])
  })

  it('lida com CRLF', () => {
    expect(parseCsv('nome;telefone\r\nAna;41999998888').rows).toEqual([['Ana', '41999998888']])
  })

  it('respeita separador dentro de aspas', () => {
    expect(parseCsv('nome;obs\n"Ana";"corte; barba"').rows).toEqual([['Ana', 'corte; barba']])
  })

  it('desescapa aspas duplicadas', () => {
    expect(parseCsv('obs\n"cliente dito ""VIP"""').rows).toEqual([['cliente dito "VIP"']])
  })

  it('descarta linhas totalmente vazias', () => {
    expect(parseCsv('nome;telefone\nAna;41999998888\n;\n').rows).toEqual([
      ['Ana', '41999998888'],
    ])
  })

  it('sobrevive a arquivo só com cabeçalho', () => {
    const { headers, rows } = parseCsv('nome;telefone')
    expect(headers).toEqual(['nome', 'telefone'])
    expect(rows).toEqual([])
  })

  it('faz round-trip com buildCsv', () => {
    const headers = ['nome', 'telefone', 'obs']
    const rows = [
      ['Ana', '41999998888', 'corte; barba'],
      ['João "Jr"', '11988887777', ''],
    ]
    const { headers: h, rows: r } = parseCsv(buildCsv(headers, rows))
    expect(h).toEqual(headers)
    expect(r).toEqual(rows)
  })
})

/**
 * `linhas` é o número que a importação mostra para o dono quando recusa um
 * registro ("linha 42"). Ele vai procurar esse número na lateral do Excel, com
 * a planilha aberta na frente. Se a contagem deslocar um degrau, a mensagem
 * acusa o cliente de cima ou o de baixo — e o dono conserta quem estava certo,
 * enquanto o errado entra no banco.
 *
 * Os casos abaixo são exatamente os que deslocam: linha em branco no meio,
 * linha em branco no começo (que empurra o cabeçalho para baixo) e quebra de
 * linha dentro de aspas, que ocupa duas linhas na tela e é um registro só.
 */
describe('parseCsv: número da linha no arquivo', () => {
  it('conta o cabeçalho como linha 1, então o primeiro registro é a linha 2', () => {
    const { rows, linhas } = parseCsv('nome;telefone\nAna;41999998888\nBia;41988887777')
    expect(rows).toEqual([
      ['Ana', '41999998888'],
      ['Bia', '41988887777'],
    ])
    expect(linhas).toEqual([2, 3])
  })

  it('linha em branco no meio sai de rows sem puxar os seguintes para trás', () => {
    const { rows, linhas } = parseCsv('nome;telefone\nAna;41999998888\n\nBia;41988887777')
    expect(rows).toEqual([
      ['Ana', '41999998888'],
      ['Bia', '41988887777'],
    ])
    // Bia é o 2º registro, mas mora na 4ª linha do arquivo — 4 é o que o Excel mostra.
    expect(linhas).toEqual([2, 4])
  })

  it('linha em branco no começo joga o cabeçalho para a 2 e o registro para a 3', () => {
    const { headers, rows, linhas } = parseCsv('\nnome;telefone\nAna;41999998888')
    expect(headers).toEqual(['nome', 'telefone'])
    expect(rows).toEqual([['Ana', '41999998888']])
    expect(linhas).toEqual([3])
  })

  it('quebra de linha dentro de aspas é um registro só, mas custa duas linhas', () => {
    const { rows, linhas } = parseCsv('nome;obs\nAna;"primeira\nsegunda"\nBia;curta')
    expect(rows).toEqual([
      ['Ana', 'primeira\nsegunda'],
      ['Bia', 'curta'],
    ])
    // A observação da Ana termina na linha 3, então Bia começa na 4 — não na 3.
    expect(linhas).toEqual([2, 4])
  })

  it('devolve um número por registro mesmo no arquivo bagunçado', () => {
    // Vazia no começo, campo com duas linhas, vazia solta e uma linha só com ";".
    const { rows, linhas } = parseCsv('\nnome;obs\nAna;"uma\nduas"\n\n;\nBia;curta\n')
    expect(rows).toEqual([
      ['Ana', 'uma\nduas'],
      ['Bia', 'curta'],
    ])
    // Quem lê a mensagem indexa rows e linhas com o mesmo i; tamanhos diferentes
    // dariam "linha undefined" ou apontariam outro registro.
    expect(linhas).toHaveLength(rows.length)
    expect(linhas).toEqual([3, 7])
  })
})
