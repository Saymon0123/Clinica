import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Props = {
  salonId: string
  onClose: () => void
  onCreated: () => void
}

export function NewClientModal({ salonId, onClose, onCreated }: Props) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [aniversario, setAniversario] = useState('')
  const [observacao, setObservacao] = useState('')
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
      const { error: insertError } = await supabase.from('clients').insert({
        salon_id: salonId,
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        aniversario: aniversario || null,
        observacao: observacao.trim() || null,
      })
      if (insertError) throw insertError

      onCreated()
      onClose()
    } catch (err) {
      console.error('Erro ao adicionar cliente:', err)
      setError('Não foi possível salvar o cliente. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Adicionar cliente</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-500 p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="nome">Nome</label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="telefone">Telefone</label>
            <input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="(11) 90000-0000"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="aniversario">Aniversário</label>
            <input
              id="aniversario"
              type="date"
              value={aniversario}
              onChange={(e) => setAniversario(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="observacao">Observação (opcional)</label>
            <textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gray-900 text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
