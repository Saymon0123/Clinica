import { describe, expect, it } from 'vitest'
import { lerEscolha, tentarEmOrdem, type Candidato, type Tentativa } from './escolhaDoBarbeiro'

const ana: Candidato = { professional_id: 'a', profissional: 'Ana' }
const bruno: Candidato = { professional_id: 'b', profissional: 'Bruno' }
const caio: Candidato = { professional_id: 'c', profissional: 'Caio' }

describe('o barbeiro pedido', () => {
  it('entende "qualquer"', () => {
    expect(lerEscolha('qualquer')).toBe('qualquer')
    expect(lerEscolha('  qualquer ')).toBe('qualquer')
  })

  it('aceita um id de barbeiro, sempre em minúsculas', () => {
    expect(lerEscolha('93FF7B46-1B07-4C1A-AF35-BB3D28677427')).toBe(
      '93ff7b46-1b07-4c1a-af35-bb3d28677427',
    )
  })

  it('ausente ou malformado vira nulo -- texto qualquer nunca chega ao banco como id', () => {
    expect(lerEscolha(undefined)).toBeNull()
    expect(lerEscolha('')).toBeNull()
    expect(lerEscolha('Qualquer')).toBeNull()
    expect(lerEscolha("1' or '1'='1")).toBeNull()
    expect(lerEscolha(42)).toBeNull()
  })
})

describe('gravar o "qualquer um" na ordem da régua', () => {
  it('fica com o primeiro quando ele está livre -- e nem tenta os outros', async () => {
    const tentados: string[] = []
    const r = await tentarEmOrdem([ana, bruno], async (c): Promise<Tentativa<string>> => {
      tentados.push(c.profissional)
      return { ok: true, valor: `marcado com ${c.profissional}` }
    })
    expect(r).toEqual({ ok: true, valor: 'marcado com Ana', quem: ana })
    expect(tentados).toEqual(['Ana'])
  })

  it('O CORAÇÃO: a vaga do primeiro sumiu no meio -- vai para o segundo, sem erro para o cliente', async () => {
    const r = await tentarEmOrdem([ana, bruno, caio], async (c): Promise<Tentativa<string>> =>
      c === ana ? { ok: false, conflito: true } : { ok: true, valor: c.profissional },
    )
    expect(r.ok && r.quem).toBe(bruno)
  })

  it('erro que NÃO é conflito para tudo: insistir só repetiria a falha', async () => {
    const tentados: string[] = []
    const r = await tentarEmOrdem([ana, bruno], async (c): Promise<Tentativa<string>> => {
      tentados.push(c.profissional)
      return { ok: false, conflito: false, erro: 'banco fora' }
    })
    expect(r).toEqual({ ok: false, motivo: 'erro', erro: 'banco fora' })
    expect(tentados).toEqual(['Ana'])
  })

  it('todos foram pegos: diz isso, e não "erro"', async () => {
    const r = await tentarEmOrdem([ana, bruno], async () => ({ ok: false, conflito: true }))
    expect(r).toEqual({ ok: false, motivo: 'todos_ocupados' })
  })

  it('ninguém livre naquele instante: diz isso sem tentar gravar nada', async () => {
    let tentou = false
    const r = await tentarEmOrdem([], async () => {
      tentou = true
      return { ok: true, valor: 'x' }
    })
    expect(r).toEqual({ ok: false, motivo: 'sem_candidato' })
    expect(tentou).toBe(false)
  })
})
