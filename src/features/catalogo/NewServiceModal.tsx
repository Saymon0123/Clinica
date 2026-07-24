import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ServiceItem } from './types'

type Props = {
  salonId: string
  service?: ServiceItem
  onClose: () => void
  onSaved: () => void
}

export function NewServiceModal({ salonId, service, onClose, onSaved }: Props) {
  const [nome, setNome] = useState(service?.nome ?? '')
  const [duracao, setDuracao] = useState(String(service?.duracao_minutos ?? 30))
  const [preco, setPreco] = useState(String(service?.preco ?? ''))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const duracaoMinutos = parseInt(duracao, 10)
    const precoValor = parseFloat(preco.replace(',', '.'))

    if (!nome.trim()) {
      setError('Informe o nome do serviço.')
      return
    }
    if (!duracaoMinutos || duracaoMinutos <= 0) {
      setError('Informe uma duração válida (em minutos).')
      return
    }
    if (isNaN(precoValor) || precoValor < 0) {
      setError('Informe um preço válido.')
      return
    }

    setSubmitting(true)
    try {
      if (service) {
        const { error: updateError } = await supabase
          .from('services')
          .update({ nome: nome.trim(), duracao_minutos: duracaoMinutos, preco: precoValor })
          .eq('id', service.id)
        if (updateError) throw updateError
      } else {
        const { data: newService, error: insertError } = await supabase
          .from('services')
          .insert({ salon_id: salonId, nome: nome.trim(), duracao_minutos: duracaoMinutos, preco: precoValor })
          .select('id')
          .single()
        if (insertError) throw insertError

        const { data: professionals } = await supabase
          .from('professionals')
          .select('id')
          .eq('salon_id', salonId)
          .eq('ativo', true)

        if (professionals && professionals.length > 0) {
          await supabase.from('professional_services').insert(
            professionals.map((p) => ({ professional_id: p.id, service_id: newService.id })),
          )
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar serviço:', err)
      setError('Não foi possível salvar o serviço. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-surface rounded-xl border border-border-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {service ? 'Editar serviço' : 'Novo serviço'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="nome">Nome do serviço</label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Corte de cabelo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="duracao">Duração (min)</label>
              <input
                id="duracao"
                type="number"
                min={5}
                step={5}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                required
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="preco">Preço (R$)</label>
              <input
                id="preco"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                required
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                placeholder="60,00"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
