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
