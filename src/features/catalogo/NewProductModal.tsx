import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Campo, Input } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import type { ProductItem } from './types'

type Props = {
  salonId: string
  product?: ProductItem
  onClose: () => void
  onSaved: () => void
}

export function NewProductModal({ salonId, product, onClose, onSaved }: Props) {
  const [nome, setNome] = useState(product?.nome ?? '')
  const [precoVenda, setPrecoVenda] = useState(product ? String(product.preco_venda ?? '') : '')
  const [precoCusto, setPrecoCusto] = useState(product ? String(product.preco_custo ?? '') : '')
  const [estoqueAtual, setEstoqueAtual] = useState(String(product?.estoque_atual ?? 0))
  const [estoqueMinimo, setEstoqueMinimo] = useState(String(product?.estoque_minimo ?? 0))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const vendaValor = precoVenda.trim() ? parseFloat(precoVenda.replace(',', '.')) : null
    const custoValor = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null
    const atual = parseInt(estoqueAtual, 10) || 0
    const minimo = parseInt(estoqueMinimo, 10) || 0

    if (!nome.trim()) {
      setError('Informe o nome do produto.')
      return
    }
    if (vendaValor !== null && (isNaN(vendaValor) || vendaValor < 0)) {
      setError('Informe um preço de venda válido.')
      return
    }

    setSubmitting(true)
    try {
      if (product) {
        // O saldo NÃO entra no update: mudança de estoque vira um movimento, e
        // o trigger do banco (0109) aplica no saldo — uma fonte de verdade só,
        // com rastro auditável.
        const { error: updateError } = await supabase
          .from('products')
          .update({
            nome: nome.trim(),
            preco_venda: vendaValor,
            preco_custo: custoValor,
            estoque_minimo: minimo,
          })
          .eq('id', product.id)
        if (updateError) throw updateError
        const delta = atual - product.estoque_atual
        if (delta !== 0) {
          const { error: movError } = await supabase.from('stock_movements').insert({
            product_id: product.id,
            tipo: delta > 0 ? 'entrada' : 'saida',
            quantidade: Math.abs(delta),
            motivo: 'ajuste manual (edição do produto)',
          })
          if (movError) throw movError
        }
      } else {
        const { error: insertError } = await supabase.from('products').insert({
          salon_id: salonId,
          nome: nome.trim(),
          preco_venda: vendaValor,
          preco_custo: custoValor,
          estoque_atual: atual,
          estoque_minimo: minimo,
        })
        if (insertError) throw insertError
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar produto:', err)
      setError('Não foi possível salvar o produto. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose} titulo={product ? 'Editar produto' : 'Novo produto'} tamanho="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo rotulo="Nome do produto" htmlFor="nome">
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Pomada modeladora"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preço de venda (R$)" htmlFor="precoVenda">
              <Input
                id="precoVenda"
                inputMode="decimal"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="35,00"
              />
            </Campo>
            <Campo rotulo="Preço de custo (opcional)" htmlFor="precoCusto">
              <Input
                id="precoCusto"
                inputMode="decimal"
                value={precoCusto}
                onChange={(e) => setPrecoCusto(e.target.value)}
                placeholder="18,00"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Estoque atual" htmlFor="estoqueAtual">
              <Input
                id="estoqueAtual"
                type="number"
                min={0}
                value={estoqueAtual}
                onChange={(e) => setEstoqueAtual(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Estoque mínimo" htmlFor="estoqueMinimo">
              <Input
                id="estoqueMinimo"
                type="number"
                min={0}
                value={estoqueMinimo}
                onChange={(e) => setEstoqueMinimo(e.target.value)}
              />
            </Campo>
          </div>

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
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
