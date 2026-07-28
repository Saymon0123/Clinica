import { useState } from 'react'
import { Lock, Plus, Power } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAuth } from '../auth/AuthContext'
import { useServicesData } from './useServicesData'
import { useProductsData } from './useProductsData'
import { NewServiceModal } from './NewServiceModal'
import { NewProductModal } from './NewProductModal'
import { supabase } from '../../lib/supabase'
import type { ServiceItem, ProductItem } from './types'
import { usePackagesData, type Pacote } from '../pacotes/usePackagesData'
import { PacoteModal } from '../pacotes/PacoteModal'
import { PacotesTab } from '../pacotes/PacotesTab'

type Tab = 'servicos' | 'produtos' | 'pacotes'

function formatCurrency(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CatalogoPage() {
  const { salonId, isManager, loading: salonLoading } = useSalon()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('servicos')

  const { services, loading: loadingServices, error: servicesError, reload: reloadServices } = useServicesData(salonId)
  const { products, loading: loadingProducts, error: productsError, reload: reloadProducts } = useProductsData(salonId)

  const [editingService, setEditingService] = useState<ServiceItem | 'new' | null>(null)
  const [editingProduct, setEditingProduct] = useState<ProductItem | 'new' | null>(null)
  const { pacotes, erro: pacotesErro, recarregar: recarregarPacotes } = usePackagesData(salonId)
  const [editingPacote, setEditingPacote] = useState<Pacote | 'new' | null>(null)

  // Gestor mexe em tudo; barbeiro só no que ele mesmo cadastrou.
  function podeMexer(service: ServiceItem) {
    return isManager || (!!service.created_by && service.created_by === user?.id)
  }

  async function toggleServiceActive(service: ServiceItem) {
    await supabase.from('services').update({ ativo: !service.ativo }).eq('id', service.id)
    reloadServices()
  }

  async function toggleProductActive(product: ProductItem) {
    await supabase.from('products').update({ ativo: !product.ativo }).eq('id', product.id)
    reloadProducts()
  }

  if (salonLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-foreground">Catálogo</h1>

        <div className="inline-flex rounded-lg border border-border-strong overflow-hidden text-sm">
          <button
            onClick={() => setTab('servicos')}
            className={`px-4 py-2 font-medium ${tab === 'servicos' ? 'btn-primary' : 'bg-surface text-foreground hover:bg-surface-2'}`}
          >
            Serviços
          </button>
          <button
            onClick={() => setTab('produtos')}
            className={`px-4 py-2 font-medium border-l border-border-strong ${tab === 'produtos' ? 'btn-primary' : 'bg-surface text-foreground hover:bg-surface-2'}`}
          >
            Produtos
          </button>
          <button
            onClick={() => setTab('pacotes')}
            className={`px-4 py-2 font-medium border-l border-border-strong ${tab === 'pacotes' ? 'btn-primary' : 'bg-surface text-foreground hover:bg-surface-2'}`}
          >
            Pacotes
          </button>
        </div>
      </div>

      {tab === 'pacotes' ? (
        <PacotesTab
          pacotes={pacotes}
          servicos={services}
          erro={pacotesErro}
          isManager={isManager}
          onNovo={() => setEditingPacote('new')}
          onEditar={(p) => setEditingPacote(p)}
          onAlterado={recarregarPacotes}
        />
      ) : tab === 'servicos' ? (
        <div>
          {/* Barbeiro também acrescenta serviço; só não mexe no que não é dele. */}
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingService('new')}
              className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
            >
              <Plus size={16} />
              Novo serviço
            </button>
          </div>

          {servicesError && <p className="text-sm text-danger mb-3">{servicesError}</p>}

          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-medium">Serviço</th>
                  <th className="px-4 py-2 font-medium">Duração</th>
                  <th className="px-4 py-2 font-medium">Preço</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground font-medium">{s.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.duracao_minutos} min</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrency(s.preco)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.ativo ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400' : 'bg-surface-2 text-muted-foreground'}`}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {podeMexer(s) ? (
                        <>
                          <button
                            onClick={() => setEditingService(s)}
                            className="text-xs text-muted-foreground underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleServiceActive(s)}
                            className="text-xs text-muted-foreground underline inline-flex items-center gap-1"
                          >
                            <Power size={12} />
                            {s.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock size={11} />
                          Da gestão
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loadingServices && services.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum serviço cadastrado ainda.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          {isManager && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingProduct('new')}
                className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
              >
                <Plus size={16} />
                Novo produto
              </button>
            </div>
          )}

          {productsError && <p className="text-sm text-danger mb-3">{productsError}</p>}

          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Preço de venda</th>
                  <th className="px-4 py-2 font-medium">Estoque</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground font-medium">{p.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrency(p.preco_venda)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.estoque_atual}
                      {p.estoque_atual <= p.estoque_minimo && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">baixo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400' : 'bg-surface-2 text-muted-foreground'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="text-xs text-muted-foreground underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleProductActive(p)}
                        className="text-xs text-muted-foreground underline inline-flex items-center gap-1"
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
              <p className="text-sm text-muted-foreground text-center py-8">
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

      {editingPacote && salonId && (
        <PacoteModal
          salonId={salonId}
          servicos={services}
          pacote={editingPacote === 'new' ? null : editingPacote}
          onClose={() => setEditingPacote(null)}
          onSalvo={recarregarPacotes}
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
