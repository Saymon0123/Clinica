import { useState, type FormEvent } from 'react'
import { PackagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ProductItem } from './types'

/**
 * Reposição em um toque: "quantas chegaram?" e pronto — o sistema soma.
 * O fluxo antigo (editar o produto e digitar o TOTAL novo) exigia conta de
 * cabeça e não registrava movimento de estoque; aqui o movimento de entrada
 * fica gravado, então a conferência futura tem rastro.
 */
export function ReporEstoqueModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductItem
  onClose: () => void
  onSaved: () => void
}) {
  const [quantidade, setQuantidade] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qtd = parseInt(quantidade, 10)
    if (!qtd || qtd <= 0) {
      setErro('Informe quantas unidades chegaram.')
      return
    }
    setSalvando(true)
    setErro(null)

    const { error: movErro } = await supabase.from('stock_movements').insert({
      product_id: product.id,
      tipo: 'entrada',
      quantidade: qtd,
      motivo: 'reposição',
    })
    if (movErro) {
      console.error('Erro ao registrar a reposição:', movErro)
      setErro('Não foi possível registrar a reposição.')
      setSalvando(false)
      return
    }

    const { error: prodErro } = await supabase
      .from('products')
      .update({ estoque_atual: product.estoque_atual + qtd })
      .eq('id', product.id)
    setSalvando(false)
    if (prodErro) {
      console.error('Erro ao atualizar o estoque:', prodErro)
      setErro('O movimento foi registrado, mas o estoque não atualizou. Tente de novo.')
      return
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-xs p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Repor {product.nome}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Quantas unidades chegaram?</span>
            <input
              type="number"
              min={1}
              autoFocus
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Estoque atual: {product.estoque_atual}
            {quantidade && parseInt(quantidade, 10) > 0
              ? ` → fica ${product.estoque_atual + parseInt(quantidade, 10)}`
              : ''}
          </p>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <PackagePlus size={15} />
            {salvando ? 'Salvando...' : 'Somar ao estoque'}
          </button>
        </form>
      </div>
    </div>
  )
}
