import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Clock, Copy, Link2, Plus, Power, UserPlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { HorarioBarbeiroModal } from './HorarioBarbeiroModal'

type Membro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  comissao_percentual: number | null
  user_id: string | null
}

type Convite = {
  id: string
  nome: string
  email: string
  token: string
  role: string
  expira_em: string
  usado_em: string | null
}

function linkDoConvite(token: string) {
  return `${window.location.origin}/convite/${token}`
}

export function EquipePage() {
  const { salonId, isManager, loading: salonLoading } = useSalon()
  const [membros, setMembros] = useState<Membro[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [horarioDe, setHorarioDe] = useState<Membro | null>(null)

  const carregar = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    const [{ data: profs }, { data: convs }] = await Promise.all([
      supabase
        .from('professionals')
        .select('id, nome, telefone, ativo, comissao_percentual, user_id')
        .eq('salon_id', salonId)
        .order('nome'),
      supabase
        .from('salon_invites')
        .select('id, nome, email, token, role, expira_em, usado_em')
        .eq('salon_id', salonId)
        .is('usado_em', null)
        .order('created_at', { ascending: false }),
    ])
    setMembros((profs ?? []) as Membro[])
    setConvites((convs ?? []) as Convite[])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternarAtivo(m: Membro) {
    const { error } = await supabase.from('professionals').update({ ativo: !m.ativo }).eq('id', m.id)
    if (error) {
      setErro('Não foi possível alterar o status.')
      return
    }
    carregar()
  }

  async function copiar(token: string) {
    await navigator.clipboard.writeText(linkDoConvite(token))
    setCopiado(token)
    setTimeout(() => setCopiado(null), 1500)
  }

  if (salonLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>

  if (!isManager) {
    return (
      <p className="text-sm text-muted-foreground">
        Só o dono da barbearia tem acesso à gestão da equipe.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Equipe</h1>
          <p className="text-sm text-muted-foreground">Barbeiros que atendem nesta barbearia</p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          Convidar barbeiro
        </button>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {/* Convites pendentes */}
      {convites.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Convites aguardando</h2>
          <div className="space-y-2">
            {convites.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.email} · expira em{' '}
                    {new Date(c.expira_em).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button
                  onClick={() => copiar(c.token)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0"
                >
                  {copiado === c.token ? <Check size={13} /> : <Copy size={13} />}
                  {copiado === c.token ? 'Link copiado!' : 'Copiar link'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equipe */}
      <div className="bg-surface border border-border rounded-xl divide-y divide-border">
        {loading && <p className="text-sm text-muted-foreground p-4">Carregando...</p>}

        {membros.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-soft text-primary-soft-foreground font-semibold text-sm shrink-0">
                {m.nome.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {m.nome}
                  {!m.ativo && (
                    <span className="ml-2 text-[11px] rounded-full bg-surface-2 text-muted-foreground px-2 py-0.5">
                      Inativo
                    </span>
                  )}
                  {!m.user_id && (
                    <span className="ml-2 text-[11px] rounded-full bg-warning/15 text-warning px-2 py-0.5">
                      Sem acesso
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.comissao_percentual ? `Comissão ${Number(m.comissao_percentual).toFixed(0)}%` : 'Sem comissão definida'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setHorarioDe(m)}
                aria-label={`Horário de ${m.nome}`}
                title="Horário de trabalho"
                className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Clock size={16} />
              </button>
              <button
                onClick={() => alternarAtivo(m)}
                aria-label={m.ativo ? `Desativar ${m.nome}` : `Reativar ${m.nome}`}
                className={`p-2 rounded hover:bg-surface-2 ${
                  m.ativo ? 'text-muted-foreground hover:text-danger' : 'text-success'
                }`}
              >
                <Power size={16} />
              </button>
            </div>
          </div>
        ))}

        {!loading && membros.length === 0 && (
          <p className="text-sm text-muted-foreground p-6 text-center">
            Nenhum barbeiro cadastrado ainda.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        O barbeiro vê apenas os agendamentos dele, os clientes que atendeu e a própria comissão.
        Faturamento da barbearia, WhatsApp e catálogo ficam só com você.
      </p>

      {horarioDe && (
        <HorarioBarbeiroModal
          professionalId={horarioDe.id}
          nome={horarioDe.nome}
          onClose={() => setHorarioDe(null)}
        />
      )}

      {modalAberto && salonId && (
        <ConviteModal
          salonId={salonId}
          onClose={() => setModalAberto(false)}
          onCriado={carregar}
        />
      )}
    </div>
  )
}

function ConviteModal({
  salonId,
  onClose,
  onCriado,
}: {
  salonId: string
  onClose: () => void
  onCriado: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [comissao, setComissao] = useState('50')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha nome e e-mail.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('E-mail inválido.')
      return
    }

    setSalvando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('salon_invites')
      .insert({
        salon_id: salonId,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        role: 'barbeiro',
        comissao_percentual: comissao ? Number(comissao) : null,
      })
      .select('token')
      .single()
    setSalvando(false)

    if (error || !data) {
      console.error('Erro ao criar convite:', error)
      setErro('Não foi possível gerar o convite. Tente novamente.')
      return
    }

    setLink(linkDoConvite(data.token))
    onCriado()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <UserPlus size={18} />
            Convidar barbeiro
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">Convite criado! Mande este link para o barbeiro:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface-2 rounded px-3 py-2 text-xs break-all">{link}</code>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 1500)
                }}
                aria-label="Copiar link"
                className="p-2 border border-border-strong rounded text-muted-foreground hover:bg-surface-2 shrink-0"
              >
                {copiado ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              O link vale por 7 dias e só pode ser usado uma vez. Ele vai criar a própria senha.
            </p>
            <button onClick={onClose} className="w-full btn-primary rounded px-3 py-2 text-sm font-medium">
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={criar} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Nome do barbeiro</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">E-mail de acesso</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Comissão (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={comissao}
                onChange={(e) => setComissao(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </label>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={salvando}
              className="w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Link2 size={15} />
              {salvando ? 'Gerando...' : 'Gerar link de convite'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
