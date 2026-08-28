import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Campo, Input, TextArea } from '../../components/Campo'
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
    <Modal onClose={onClose} titulo={isEditing ? 'Editar cliente' : 'Adicionar cliente'} tamanho="md">
      <form onSubmit={handleSubmit} className="space-y-4">
          <Campo rotulo="Nome" htmlFor="nome">
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Nome completo"
            />
          </Campo>

          <Campo rotulo="Telefone" htmlFor="telefone">
            <Input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </Campo>

          <Campo rotulo="Aniversário" htmlFor="aniversario">
            <Input
              id="aniversario"
              type="date"
              value={aniversario}
              onChange={(e) => setAniversario(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Observação (opcional)" htmlFor="observacao">
            <TextArea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </Campo>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar cliente'}
            </button>
          </div>
      </form>
    </Modal>
  )
}
