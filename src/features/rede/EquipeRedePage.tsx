import { useCallback, useEffect, useState } from 'react'
import { Building2, ShieldCheck, Scissors, UserPlus, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useSalon, type Papel } from '../auth/useSalon'

type Membro = {
  vinculoId: string
  userId: string
  salonId: string
  unidade: string
  role: Papel
  nome: string | null
}

const LABEL_PAPEL: Record<Papel, string> = {
  owner: 'Dono',
  gerente: 'Gerente',
  barbeiro: 'Barbeiro',
}

/**
 * Equipe de toda a rede, agrupada por unidade, com troca de função.
 *
 * Só o dono chega aqui: é ele quem promove barbeiro a gerente. A troca mexe
 * apenas em `user_salons.role`, que é a tabela que as políticas do banco
 * consultam — mudar aqui muda o acesso de verdade, não só a tela.
 */
export function EquipeRedePage() {
  const { user } = useAuth()
  const { unidades, isOwner, selecionarUnidade, recarregarUnidades } = useSalon()
  const [membros, setMembros] = useState<Membro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  const proprias = unidades.filter((u) => u.role === 'owner')
  const ids = proprias.map((u) => u.salonId).join(',')

  const carregar = useCallback(async () => {
    if (proprias.length === 0) {
      setMembros([])
      setCarregando(false)
      return
    }

    setCarregando(true)
    setErro(null)
    const salonIds = proprias.map((u) => u.salonId)
    const nomeDaUnidade = new Map(proprias.map((u) => [u.salonId, u.nome]))

    const [vinculosRes, profsRes] = await Promise.all([
      supabase.from('user_salons').select('id, user_id, salon_id, role').in('salon_id', salonIds),
      supabase.from('professionals').select('user_id, nome, salon_id').in('salon_id', salonIds),
    ])

    if (vinculosRes.error || profsRes.error) {
      console.error(vinculosRes.error ?? profsRes.error)
      setErro('Não foi possível carregar a equipe da rede.')
      setCarregando(false)
      return
    }

    type LinhaProf = { user_id: string | null; nome: string; salon_id: string }
    const nomePorUsuario = new Map<string, string>()
    for (const p of (profsRes.data ?? []) as LinhaProf[]) {
      if (p.user_id) nomePorUsuario.set(`${p.user_id}:${p.salon_id}`, p.nome)
    }

    type LinhaVinculo = { id: string; user_id: string; salon_id: string; role: string }
    setMembros(
      ((vinculosRes.data ?? []) as LinhaVinculo[])
        .map((v) => ({
          vinculoId: v.id,
          userId: v.user_id,
          salonId: v.salon_id,
          unidade: nomeDaUnidade.get(v.salon_id) ?? '—',
          role: v.role as Papel,
          nome: nomePorUsuario.get(`${v.user_id}:${v.salon_id}`) ?? null,
        }))
        .sort(
          (a, b) =>
            a.unidade.localeCompare(b.unidade) ||
            a.role.localeCompare(b.role) ||
            (a.nome ?? '').localeCompare(b.nome ?? ''),
        ),
    )
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function trocarPapel(m: Membro, novo: Papel) {
    if (novo === m.role) return

    // Uma unidade sem dono fica sem quem gerencie a equipe e a conexão, e
    // ninguém conseguiria promover alguém de volta — é uma porta sem volta.
    if (m.role === 'owner' && novo !== 'owner') {
      const outrosDonos = membros.filter(
        (x) => x.salonId === m.salonId && x.role === 'owner' && x.vinculoId !== m.vinculoId,
      )
      if (outrosDonos.length === 0) {
        setErro(
          `${m.unidade} ficaria sem dono. Promova outra pessoa a dono nessa unidade antes de mudar esta.`,
        )
        return
      }
    }

    if (m.userId === user?.id) {
      const confirmado = window.confirm(
        `Você vai deixar de ser dono de ${m.unidade} e perderá o acesso de gestão dessa unidade. Continuar?`,
      )
      if (!confirmado) return
    }

    setSalvando(m.vinculoId)
    setErro(null)
    const { error } = await supabase.from('user_salons').update({ role: novo }).eq('id', m.vinculoId)
    setSalvando(null)
    if (error) {
      console.error('Erro ao trocar a função:', error)
      setErro('Não foi possível alterar a função.')
      return
    }
    // O próprio papel mudou: o contexto precisa recarregar para o menu e as
    // permissões acompanharem sem exigir um novo login.
    if (m.userId === user?.id) await recarregarUnidades()
    carregar()
  }

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        Só o dono da rede tem acesso à equipe de todas as unidades.
      </p>
    )
  }

  const porUnidade = proprias.map((u) => ({
    unidade: u,
    membros: membros.filter((m) => m.salonId === u.salonId),
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Equipe da rede</h1>
        <p className="text-sm text-muted-foreground">
          Quem trabalha em cada unidade e o que cada um pode acessar
        </p>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        porUnidade.map(({ unidade, membros: lista }) => (
          <div key={unidade.salonId} className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
              <Building2 size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{unidade.nome}</h2>
              <span className="text-xs text-muted-foreground">
                {lista.length} pessoa{lista.length === 1 ? '' : 's'}
              </span>
              <Link
                to="/equipe"
                onClick={() => selecionarUnidade(unidade.salonId)}
                className="ml-auto flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <UserPlus size={13} />
                Convidar
              </Link>
            </div>

            {lista.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Ninguém vinculado a esta unidade ainda.
                </p>
                <Link
                  to="/equipe"
                  onClick={() => selecionarUnidade(unidade.salonId)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <UserPlus size={14} />
                  Convidar para {unidade.nome}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {lista.map((m) => {
                  const souEu = m.userId === user?.id
                  return (
                    <div key={m.vinculoId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-soft text-primary-soft-foreground shrink-0">
                          {m.role === 'owner' ? (
                            <ShieldCheck size={16} />
                          ) : m.role === 'gerente' ? (
                            <UserRound size={16} />
                          ) : (
                            <Scissors size={16} />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {m.nome ?? 'Sem cadastro de profissional'}
                            {souEu && (
                              <span className="ml-2 text-[11px] rounded-full bg-surface-2 text-muted-foreground px-2 py-0.5">
                                você
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{LABEL_PAPEL[m.role]}</div>
                        </div>
                      </div>

                      {/* O dono corrige qualquer função, inclusive a própria e
                          a de outro dono — cadastro errado precisa de conserto.
                          As travas ficam em trocarPapel: unidade sem dono é
                          bloqueada, e rebaixar a si mesmo pede confirmação. */}
                      <select
                        value={m.role}
                        disabled={salvando === m.vinculoId}
                        onChange={(e) => trocarPapel(m, e.target.value as Papel)}
                        aria-label={`Função de ${m.nome ?? 'membro'}`}
                        className="shrink-0 border border-border-strong bg-surface text-foreground rounded px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        <option value="barbeiro">Barbeiro</option>
                        <option value="gerente">Gerente</option>
                        <option value="owner">Dono</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Gerente enxerga e edita tudo da unidade dele, menos o painel da rede. Barbeiro vê apenas os
        próprios agendamentos, clientes e comissão.
      </p>
    </div>
  )
}
