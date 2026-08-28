import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function EditGoalModal({
  salonId,
  currentGoal,
  onClose,
  onSaved,
}: {
  salonId: string
  currentGoal: number
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState(String(currentGoal))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const goal = Number(value.replace(',', '.'))
    if (!Number.isFinite(goal) || goal <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }

    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('salons')
      .update({ meta_faturamento_mensal: goal })
      .eq('id', salonId)
    setSaving(false)

    if (updateError) {
      console.error('Erro ao salvar meta:', updateError)
      setError('Não foi possível salvar a meta. Tente novamente.')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border shadow-sm w-full max-w-xs p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Meta de faturamento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Meta mensal (R$)</span>
          <input
            type="number"
            min={1}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
