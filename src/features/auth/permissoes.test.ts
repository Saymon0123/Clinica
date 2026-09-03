import { describe, expect, it } from 'vitest'
import { permissoes } from './permissoes'
import type { Unidade } from './SalonContext'

const unidade = (salonId: string, role: Unidade['role']): Unidade => ({
  salonId,
  nome: salonId,
  role,
  organizationId: null,
  ativo: true,
})

/** Passo 4.3: dono de alguma, dono desta e dono de rede são três coisas. */
describe('permissões', () => {
  it('dono de uma barbearia só: é dono desta, mas não vê a rede', () => {
    const p = permissoes([unidade('a', 'owner')], 'a')
    expect(p.isOwner).toBe(true)
    expect(p.ehDonoDesta).toBe(true)
    expect(p.isNetwork).toBe(false)
    expect(p.podeVerRede).toBe(false)
    expect(p.isManager).toBe(true)
  })

  it('dono de duas: vê a rede', () => {
    const p = permissoes([unidade('a', 'owner'), unidade('b', 'owner')], 'b')
    expect(p.podeVerRede).toBe(true)
    expect(p.ehDonoDesta).toBe(true)
  })

  it('dono de uma e gerente de outra: na outra, não é dono desta', () => {
    const p = permissoes([unidade('a', 'owner'), unidade('b', 'gerente')], 'b')
    expect(p.isOwner).toBe(true)
    expect(p.ehDonoDesta).toBe(false)
    expect(p.isManager).toBe(true)
    expect(p.podeVerRede).toBe(false)
  })

  it('gerente de duas unidades não vê a rede — ela é do dono', () => {
    const p = permissoes([unidade('a', 'gerente'), unidade('b', 'gerente')], 'a')
    expect(p.isOwner).toBe(false)
    expect(p.podeVerRede).toBe(false)
  })

  it('dono de rede sem unidade escolhida: pode ver a rede, não é dono "desta"', () => {
    const p = permissoes([unidade('a', 'owner'), unidade('b', 'owner')], null)
    expect(p.podeVerRede).toBe(true)
    expect(p.ehDonoDesta).toBe(false)
    expect(p.isManager).toBe(false)
    expect(p.role).toBeNull()
  })

  it('barbeiro: nada disso', () => {
    const p = permissoes([unidade('a', 'barbeiro')], 'a')
    expect(p).toMatchObject({ isManager: false, isOwner: false, ehDonoDesta: false, podeVerRede: false })
  })
})
