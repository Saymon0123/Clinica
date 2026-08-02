import { describe, expect, it } from 'vitest'
import { problemaNaChave, problemaNaUrl } from './credenciaisSupabase'

const CHAVE_VALIDA =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYyJ9.assinatura_qualquer-123'

describe('problemaNaChave', () => {
  it('aceita o JWT legado e a publishable key', () => {
    expect(problemaNaChave(CHAVE_VALIDA)).toBeNull()
    expect(problemaNaChave('sb_publishable_-W8mdP5RxXV_mxm8R6fZjw_gUsgRCkG')).toBeNull()
  })

  // O caso real: chave copiada do campo mascarado da Vercel/Supabase, com
  // 8 caracteres verdadeiros e 200 bolinhas no lugar do resto.
  it('reconhece a chave copiada do campo mascarado', () => {
    const mascarada = 'eyJhbGci' + '•'.repeat(200)
    const problema = problemaNaChave(mascarada)
    expect(problema).toMatch(/máscara/i)
    expect(problema).toMatch(/revele/i)
  })

  it('reconhece qualquer caractere fora do Latin-1 e diz qual e', () => {
    // Aspa tipográfica, o que sobra de copiar de documento formatado.
    const problema = problemaNaChave(CHAVE_VALIDA + '”')
    expect(problema).toMatch(/U\+201D/)
  })

  it('reconhece espaco e quebra de linha', () => {
    expect(problemaNaChave(CHAVE_VALIDA + ' ')).toMatch(/espaço/i)
    expect(problemaNaChave(CHAVE_VALIDA + '\n')).toMatch(/espaço|quebra/i)
  })

  it('reconhece chave truncada ou de formato desconhecido', () => {
    expect(problemaNaChave('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toMatch(/formato/i)
    expect(problemaNaChave('minha-chave')).toMatch(/formato/i)
  })
})

describe('problemaNaUrl', () => {
  it('aceita a url do projeto', () => {
    expect(problemaNaUrl('https://bukhpvvybeltmhtwamox.supabase.co')).toBeNull()
  })

  it('aceita localhost para desenvolvimento', () => {
    expect(problemaNaUrl('http://localhost:54321')).toBeNull()
  })

  it('recusa valor que nao e url', () => {
    expect(problemaNaUrl('bukhpvvybeltmhtwamox.supabase.co')).toMatch(/não é uma URL válida/i)
  })

  it('recusa http fora de localhost', () => {
    expect(problemaNaUrl('http://bukhpvvybeltmhtwamox.supabase.co')).toMatch(/https/i)
  })
})
