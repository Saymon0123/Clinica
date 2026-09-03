import type { Papel, Unidade } from './SalonContext'

/**
 * Quem é dono, num lugar só (passo 4.3 da revisão de 01/09).
 *
 * `isOwner` significava "dono de ALGUMA unidade" no cliente e "dono DESTA
 * unidade" no servidor. Daí "Painel da rede" aparecer no menu para o dono de
 * uma barbearia só (a rota o expulsava em silêncio), e "Adicionar unidade" e o
 * seletor de papel aparecerem onde o servidor responde 403. Os três conceitos
 * agora têm nome, e as telas usam o que cada uma quer dizer:
 *
 * - `isOwner`: dono de alguma unidade (mantido por compatibilidade).
 * - `ehDonoDesta`: dono da unidade SELECIONADA — é isto que as RPCs e a RLS
 *   checam (`user_salons.role = 'owner'` nesta unidade).
 * - `podeVerRede`: dono de mais de uma unidade — o painel da rede, o menu, a
 *   guarda de rota.
 */
export type Permissoes = {
  atual: Unidade | null
  role: Papel | null
  isManager: boolean
  isOwner: boolean
  ehDonoDesta: boolean
  isNetwork: boolean
  podeVerRede: boolean
}

export function permissoes(unidades: Unidade[], selecionada: string | null): Permissoes {
  const atual = unidades.find((u) => u.salonId === selecionada) ?? null
  const role = atual?.role ?? null
  // A rede é do dono. Gerente administra a unidade dele e não enxerga o
  // comparativo entre as barbearias, mesmo que gerencie mais de uma.
  const proprias = unidades.filter((u) => u.role === 'owner')
  const isOwner = proprias.length > 0
  const isNetwork = proprias.length > 1
  return {
    atual,
    role,
    isManager: role === 'owner' || role === 'gerente',
    isOwner,
    ehDonoDesta: role === 'owner',
    isNetwork,
    podeVerRede: isOwner && isNetwork,
  }
}
