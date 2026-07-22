import { useState } from 'react'
import { Plus, Power } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useServicesData } from './useServicesData'
import { useProductsData } from './useProductsData'
import { NewServiceModal } from './NewServiceModal'
import { NewProductModal } from './NewProductModal'
import { supabase } from '../../lib/supabase'
import type { ServiceItem, ProductItem } from './types'

type Tab = 'servicos' | 'produtos'

function formatCurrency(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CatalogoPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [tab, setTab] = useState<Tab>('servicos')

  const { services, loading: loadingServices, error: servicesError, reload: reloadServices } = useServicesData(salonId)
  const { products, loading: loadingProducts, error: productsError, reload: reloadProducts } = useProductsData(salonId)

  const [editingService, setEditingService] = useState<ServiceItem | 'new' | null>(null)
  const [editingProduct, setEditingProduct] = useState<ProductItem | 'new' | null>(null)

  async function toggleServiceActive(service: ServiceItem) {
    await supabase.from('services').update({ ativo: !service.ativo }).eq('id', service.id)
    reloadServices()
  }

  async function toggleProductActive(product: ProductItem) {
    await supabase.from('products').update({ ativo: !product.ativo }).eq('id', product.id)
    reloadProducts()
  }

  if (salonLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Catálogo</h1>

        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
          <button
            onClick={() => setTab('servicos')}
            className={`px-4 py-2 font-medium ${tab === 'servicos' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Serviços
          </button>
          <button
            onClick={() => setTab('produtos')}
            className={`px-4 py-2 font-medium border-l border-gray-300 dark:border-gray-600 ${tab === 'produtos' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Produtos
          </button>
        </div>
      </div>

      {tab === 'servicos' ? (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingService('new')}
              className="flex items-center gap-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-300"
            >
              <Plus size={16} />
              Novo serviço
            </button>
          </div>

          {servicesError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{servicesError}</p>}

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 font-medium">Serviço</th>
                  <th className="px-4 py-2 font-medium">Duração</th>
                  <th className="px-4 py-2 font-medium">Preço</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{s.nome}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.duracao_minutos} min</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatCurrency(s.preco)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.ativo ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setEditingService(s)}
                        className="text-xs text-gray-600 dark:text-gray-300 underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleServiceActive(s)}
                        className="text-xs text-gray-500 dark:text-gray-400 underline inline-flex items-center gap-1"
                      >
                        <Power size={12} />
                        {s.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loadingServices && services.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Nenhum serviço cadastrado ainda.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingProduct('new')}
              className="flex items-center gap-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-300"
            >
              <Plus size={16} />
              Novo produto
            </button>
          </div>

          {productsError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{productsError}</p>}

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Preço de venda</th>
                  <th className="px-4 py-2 font-medium">Estoque</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{p.nome}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatCurrency(p.preco_venda)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {p.estoque_atual}
                      {p.estoque_atual <= p.estoque_minimo && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">baixo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="text-xs text-gray-600 dark:text-gray-300 underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleProductActive(p)}
                        className="text-xs text-gray-500 dark:text-gray-400 underline inline-flex items-center gap-1"
                      >
                        <Power size={12} />
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loadingProducts && products.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Nenhum produto cadastrado ainda.
              </p>
            )}
          </div>
        </div>
      )}

      {editingService && (
        <NewServiceModal
          salonId={salonId}
          service={editingService === 'new' ? undefined : editingService}
          onClose={() => setEditingService(null)}
          onSaved={reloadServices}
        />
      )}

      {editingProduct && (
        <NewProductModal
          salonId={salonId}
          product={editingProduct === 'new' ? undefined : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={reloadProducts}
        />
      )}
    </div>
  )
}
