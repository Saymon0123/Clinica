import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Client } from './types'

type Props = {
  salonId: string
  initial?: Client
  onClose: () => void
  onCreated: () => void
}

export function NewClientModal({ salonId, initial, onClose, onCreated }: Props) {
  const isEditing = Boolean(initial)
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [telefone, setTelefone] = useState(initial?.telefone ?? '')
  const [aniversario, setAniversario] = useState(initial?.aniversario ?? '')
  const [observacao, setObservacao] = useState(initial?.observacao ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        aniversario: aniversario || null,
        observacao: observacao.trim() || null,
      }

      if (isEditing && initial) {
        const { error: updateError } = await supabase.from('clients').update(payload).eq('id', initial.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, ...payload })
        if (insertError) throw insertError
      }

      onCreated()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar cliente:', err)
      const code = (err as { code?: string } | null)?.code
      setError(
        code === '23505'
          ? 'Já existe um cliente cadastrado com esse telefone.'
          : 'Não foi possível salvar o cliente. Tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-surface rounded-xl border border-border-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Editar cliente' : 'Adicionar cliente'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="nome">Nome</label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="telefone">Telefone</label>
            <input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="(11) 90000-0000"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="aniversario">Aniversário</label>
            <input
              id="aniversario"
              type="date"
              value={aniversario}
              onChange={(e) => setAniversario(e.target.value)}
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="observacao">Observação (opcional)</label>
            <textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary rounded px-3 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
