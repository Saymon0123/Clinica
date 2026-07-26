import { useContext } from 'react'
import { SalonContext, type Papel, type SalonContextValue, type Unidade } from './SalonContext'

export type { Papel, Unidade }

/**
 * Salão e papel do usuário logado.
 *
 * A fonte da verdade é `user_salons` — a mesma tabela que as políticas do
 * banco usam. Ler de outro lugar (como a antiga `profiles`) abriria espaço
 * para a tela mostrar um papel diferente do que o banco realmente aplica.
 *
 * O estado vive no SalonProvider, e não em cada componente: dono de rede
 * troca de unidade uma vez e a aplicação inteira acompanha.
 */
export function useSalon(): SalonContextValue {
  const ctx = useContext(SalonContext)
  if (!ctx) {
    throw new Error('useSalon precisa estar dentro de <SalonProvider>.')
  }
  return ctx
}
