import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, MessageCircle, Pencil, Power, RefreshCw } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Badge } from '../../components/Badge'
import { EstadoVazio } from '../../components/EstadoVazio'
import { Input } from '../../components/Campo'
import { Skeleton, SkeletonLinhas } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'
import { ErroInline } from '../../components/ErroInline'

type SalonRow = {
  id: string
  nome: string
  endereco: string | null
  telefone: string | null
  ativo: boolean
  created_at: string
  rede: string | null
  whatsapp: string
  equipe: number
  agendamentos30d: number
}

export function SalonList({ secret, refreshKey }: { secret: string; refreshKey: number }) {
  const [salons, setSalons] = useState<SalonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<SalonRow | null>(null)
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-salon', {
        headers: { 'x-admin-secret': secret },
        body: { action: 'list' },
      })
      if (error || data?.error) {
        setErro(data?.error ?? 'Não foi possível carregar as barbearias.')
        return
      }
      setSalons((data.salons ?? []) as SalonRow[])
    } catch (err) {
      console.error('Erro ao listar:', err)
      setErro('Não foi possível carregar as barbearias.')
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    carregar()
  }, [carregar, refreshKey])

  async function alternarAtivo(salon: SalonRow) {
    setBusy(true)
    await supabase.functions.invoke('admin-create-salon', {
      headers: { 'x-admin-secret': secret },
      body: { action: 'toggle_salon', salonId: salon.id, ativo: !salon.ativo },
    })
    setBusy(false)
    carregar()
  }

  async function salvarEdicao() {
    if (!editando) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-create-salon', {
      headers: { 'x-admin-secret': secret },
      body: {
        action: 'update_salon',
        salonId: editando.id,
        nome: editando.nome,
        endereco: editando.endereco ?? '',
        telefone: editando.telefone ?? '',
      },
    })
    setBusy(false)
    if (error || data?.error) {
      setErro(data?.error ?? 'Não foi possível salvar.')
      return
    }
    setEditando(null)
    carregar()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {loading ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {`${salons.length} barbearia${salons.length === 1 ? '' : 's'}`}
          </p>
        )}
        <button
          onClick={carregar}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      <ErroInline>{erro}</ErroInline>

      {loading && salons.length === 0 && <SkeletonLinhas />}

      {salons.map((s) => (
        <div
          key={s.id}
          className={`bg-surface border rounded-xl p-4 ${
            s.ativo ? 'border-border' : 'border-border opacity-60'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{s.nome}</span>
                {s.rede && <Badge variante="marca">{s.rede}</Badge>}
                {!s.ativo && <Badge variante="neutro">Desativada</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {s.endereco ?? 'Sem endereço'}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEditando(s)}
                aria-label={`Editar ${s.nome}`}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-surface-2"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => alternarAtivo(s)}
                disabled={busy}
                aria-label={s.ativo ? `Desativar ${s.nome}` : `Reativar ${s.nome}`}
                className={`p-1.5 rounded-md hover:bg-surface-2 ${
                  s.ativo ? 'text-danger' : 'text-success'
                }`}
              >
                <Power size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageCircle size={12} className={s.whatsapp === 'open' ? 'text-success' : ''} />
              WhatsApp {s.whatsapp === 'open' ? 'conectado' : 'não conectado'}
            </span>
            <span>{s.equipe} na equipe</span>
            <span>{s.agendamentos30d} agendamentos (30d)</span>
          </div>
        </div>
      ))}

      {!loading && salons.length === 0 && (
        <EstadoVazio icone={Building2} titulo="Nenhuma barbearia cadastrada ainda." />
      )}

      {/* Edição */}
      {editando && (
        <Modal onClose={() => setEditando(null)} titulo="Editar barbearia" tamanho="sm">
            <Input
              value={editando.nome}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              placeholder="Nome"
            />
            <Input
              value={editando.endereco ?? ''}
              onChange={(e) => setEditando({ ...editando, endereco: e.target.value })}
              placeholder="Endereço"
            />
            <Input
              value={editando.telefone ?? ''}
              onChange={(e) => setEditando({ ...editando, telefone: e.target.value })}
              placeholder="Telefone"
            />

            <button
              onClick={salvarEdicao}
              disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Check size={16} />
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
        </Modal>
      )}
    </div>
  )
}
