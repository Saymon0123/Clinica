import { describe, expect, it } from 'vitest'
import { agruparPorPeriodo } from './periodos'

const h = (hora_local: string) => ({ hora_local })

describe('agruparPorPeriodo', () => {
  it('separa nos cortes do vocabulario: meio-dia e 18h', () => {
    const grupos = agruparPorPeriodo([h('09:00'), h('11:50'), h('12:00'), h('17:50'), h('18:00'), h('20:30')])
    expect(grupos.map((g) => [g.nome, g.itens.map((i) => i.hora_local)])).toEqual([
      ['Manhã', ['09:00', '11:50']],
      ['Tarde', ['12:00', '17:50']],
      ['Noite', ['18:00', '20:30']],
    ])
  })

  it('descarta periodo vazio', () => {
    // Um título "Noite" sobre nada é ruído. A tela já tem frase própria para
    // quando não sobrou horário nenhum.
    expect(agruparPorPeriodo([h('09:00'), h('10:00')]).map((g) => g.nome)).toEqual(['Manhã'])
    expect(agruparPorPeriodo([h('14:00')]).map((g) => g.nome)).toEqual(['Tarde'])
  })

  it('devolve lista vazia quando nao ha horario', () => {
    expect(agruparPorPeriodo([])).toEqual([])
  })

  it('preserva a ordem que veio da RPC', () => {
    // `horarios_livres` termina em `order by c.inicio, c.nome`. Reordenar aqui
    // desalinharia a grade do "próximo horário livre", que é `horarios[0]`.
    const grupos = agruparPorPeriodo([h('09:00'), h('09:00'), h('09:10')])
    expect(grupos[0].itens.map((i) => i.hora_local)).toEqual(['09:00', '09:00', '09:10'])
  })

  it('NAO some com hora ilegivel', () => {
    // Se um horário some da grade e continua valendo no servidor, a pessoa vê
    // menos opções do que existem e ninguém percebe. Melhor no grupo errado
    // que invisível.
    const grupos = agruparPorPeriodo([h('09:00'), h('meia-noite')])
    expect(grupos.flatMap((g) => g.itens.map((i) => i.hora_local))).toEqual(['09:00', 'meia-noite'])
  })
})
