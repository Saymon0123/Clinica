import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Campo, Input, TextArea } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { AVISO_TELEFONE_INVALIDO, classificarTelefone } from '../../lib/telefone'
import type { Client } from './types'
import { ErroInline } from '../../components/ErroInline'

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

  // Achado 10 da revisão: este modal (que cria E edita) aceitava qualquer texto
  // no telefone. Cliente com telefone torto não recebe lembrete nem reativação
  // e ainda vira cadastro duplicado, porque é o número que diz que duas visitas
  // são da mesma pessoa. A régua é a mesma que virou CHECK
  // `clients_telefone_valido` na migration 0128 — então aqui a tela só antecipa
  // o 23514 do servidor com uma frase que o dono entende.
  const estadoDoTelefone = classificarTelefone(telefone)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    // Vazio segue em frente e grava null: cliente sem WhatsApp é legítimo, e o
    // banco também aceita nulo. Barrado mesmo é só o que não é telefone.
    if (estadoDoTelefone === 'invalido') {
      setError(AVISO_TELEFONE_INVALIDO)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        nome: nome.trim(),
        telefone: estadoDoTelefone === 'vazio' ? null : telefone.trim(),
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
      // Mesmo tradutor da Agenda: erro do banco fala a mesma língua nas duas.
      setError(
        traduzirErroDoBanco(
          err as { code?: string; message?: string },
          undefined,
          'Não foi possível salvar o cliente. Tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      titulo={isEditing ? 'Editar cliente' : 'Adicionar cliente'}
      tamanho="md"
      bloquearFechamento={submitting}
      confirmarFechamento={
        nome !== (initial?.nome ?? '') ||
        telefone !== (initial?.telefone ?? '') ||
        aniversario !== (initial?.aniversario ?? '') ||
        observacao !== (initial?.observacao ?? '')
      }
    >
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

          {/* O aviso do telefone é aviso, não erro: quem cadastra está com o
              cliente na frente e digita o número aos poucos, e um campo
              vermelho no terceiro dígito parece bronca. Por isso o texto sai em
              `text-warning` sob o campo e a borda não muda (nada de `erro` no
              Input) — vermelho fica para quem insiste e clica em salvar. */}
          <Campo
            rotulo="Telefone"
            htmlFor="telefone"
            apoio={
              <>
                É por ele que o cliente recebe lembrete e reativação, e é por ele que o sistema
                sabe que duas visitas são da mesma pessoa.
                {estadoDoTelefone === 'invalido' && (
                  <span className="block text-warning mt-0.5">
                    Ainda não é um telefone: com DDD, de 10 a 13 dígitos.
                  </span>
                )}
              </>
            }
          >
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

          <ErroInline>{error}</ErroInline>

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
