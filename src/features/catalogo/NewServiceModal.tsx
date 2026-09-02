import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Campo, Input } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import type { ServiceItem } from './types'
import { ErroInline } from '../../components/ErroInline'

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
    // Maior que zero, como o produto (0132): serviço a R$ 0,00 no catálogo
    // viraria um serviço que o caixa recusa — pior do que ser recusado aqui,
    // com explicação. Cortesia é pacote ou desconto na comanda.
    if (isNaN(precoValor) || precoValor <= 0) {
      setError('Informe o preço — maior que zero. Cortesia se faz com pacote ou desconto na comanda.')
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
      setError(
        traduzirErroDoBanco(
          err as { code?: string; message?: string },
          undefined,
          'Não foi possível salvar o serviço. Tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose} titulo={service ? 'Editar serviço' : 'Novo serviço'} tamanho="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo rotulo="Nome do serviço" htmlFor="nome">
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Corte de cabelo"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Duração (min)" htmlFor="duracao">
              <Input
                id="duracao"
                type="number"
                min={5}
                step={5}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                required
              />
            </Campo>
            <Campo rotulo="Preço (R$)" htmlFor="preco">
              <Input
                id="preco"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                required
                placeholder="60,00"
              />
            </Campo>
          </div>

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
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
