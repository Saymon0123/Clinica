import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-surface rounded-xl border border-border-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {product ? 'Editar produto' : 'Novo produto'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="nome">Nome do produto</label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              placeholder="Pomada modeladora"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="precoVenda">Preço de venda (R$)</label>
              <input
                id="precoVenda"
                inputMode="decimal"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                placeholder="35,00"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="precoCusto">Preço de custo (opcional)</label>
              <input
                id="precoCusto"
                inputMode="decimal"
                value={precoCusto}
                onChange={(e) => setPrecoCusto(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                placeholder="18,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="estoqueAtual">Estoque atual</label>
              <input
                id="estoqueAtual"
                type="number"
                min={0}
                value={estoqueAtual}
                onChange={(e) => setEstoqueAtual(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="estoqueMinimo">Estoque mínimo</label>
              <input
                id="estoqueMinimo"
                type="number"
                min={0}
                value={estoqueMinimo}
                onChange={(e) => setEstoqueMinimo(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </div>
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
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
