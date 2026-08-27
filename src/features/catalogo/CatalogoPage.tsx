import { useEffect, useState } from 'react'
import { Lock, PackagePlus, Plus, Power } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAuth } from '../auth/AuthContext'
import { useServicesData } from './useServicesData'
import { useProductsData } from './useProductsData'
import { NewServiceModal } from './NewServiceModal'
import { NewProductModal } from './NewProductModal'
import { ReporEstoqueModal } from './ReporEstoqueModal'
import { usePacotesData, type Pacote } from './usePacotesData'
import { NewPacoteModal } from './NewPacoteModal'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'
import type { ServiceItem, ProductItem } from './types'

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
  const { pacotes, loading: loadingPacotes, error: pacotesError, reload: reloadPacotes } = usePacotesData(salonId)

  const [editingService, setEditingService] = useState<ServiceItem | 'new' | null>(null)
  const [editingProduct, setEditingProduct] = useState<ProductItem | 'new' | null>(null)
  const [restockingProduct, setRestockingProduct] = useState<ProductItem | null>(null)
  const [editingPacote, setEditingPacote] = useState<Pacote | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Gestor mexe em tudo; barbeiro só no que ele mesmo cadastrou.
  function podeMexer(service: ServiceItem) {
    return isManager || (!!service.created_by && service.created_by === user?.id)
  }

  async function toggleServiceActive(service: ServiceItem) {
    setActionError(null)
    const { error } = await supabase
      .from('services')
      .update({ ativo: !service.ativo })
      .eq('id', service.id)
    if (error) {
      console.error('Erro ao alterar o serviço:', error)
      setActionError('Não foi possível alterar o serviço.')
      return
    }
    toast(service.ativo ? 'Serviço desativado' : 'Serviço ativado')
    reloadServices()
  }

  async function toggleProductActive(product: ProductItem) {
    setActionError(null)
    const { error } = await supabase
      .from('products')
      .update({ ativo: !product.ativo })
      .eq('id', product.id)
    if (error) {
      console.error('Erro ao alterar o produto:', error)
      setActionError('Não foi possível alterar o produto.')
      return
    }
    toast(product.ativo ? 'Produto desativado' : 'Produto ativado')
    reloadProducts()
  }

  async function togglePacoteAtivo(pac: Pacote) {
    setActionError(null)
    const { error } = await supabase.from('pacotes').update({ ativo: !pac.ativo }).eq('id', pac.id)
    if (error) {
      console.error('Erro ao alterar o pacote:', error)
      setActionError('Não foi possível alterar o pacote.')
      return
    }
    toast(pac.ativo ? 'Pacote desativado' : 'Pacote ativado')
    reloadPacotes()
  }

  // Estoque muda pela venda de qualquer barbeiro (e o catálogo pelo gestor em
  // outro aparelho); sem isso a tela só atualizava no F5.
  useEffect(() => {
    if (!salonId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const agendar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        reloadServices()
        reloadProducts()
      }, 2000)
    }
    const channel = supabase
      .channel(`catalogo_${salonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services', filter: `salon_id=eq.${salonId}` }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `salon_id=eq.${salonId}` }, agendar)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [salonId, reloadServices, reloadProducts])

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

      {tab === 'servicos' ? (
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

          {(servicesError || actionError) && (
            <p className="text-sm text-danger mb-3">{servicesError || actionError}</p>
          )}

          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-medium">Serviço</th>
                  <th className="px-4 py-2 font-medium">Duração</th>
                  <th className="px-4 py-2 font-medium">Preço</th>
                  <th className="px-4 py-2 font-medium" title="Vendas de comandas fechadas no mês corrente">
                    Vendas no mês
                  </th>
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
                    <td className="px-4 py-3 text-muted-foreground">{s.vendas_mes}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.ativo ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted-foreground'}`}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {podeMexer(s) ? (
                        <>
                          <button onClick={() => setEditingService(s)} className="btn-chip">
                            Editar
                          </button>
                          <button
                            onClick={() => toggleServiceActive(s)}
                            className={`btn-chip inline-flex items-center gap-1 ${s.ativo ? 'btn-chip-perigo' : ''}`}
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
      ) : tab === 'pacotes' ? (
        <div>
          {isManager && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingPacote('new')}
                className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
              >
                <Plus size={16} />
                Novo pacote
              </button>
            </div>
          )}

          {(pacotesError || actionError) && (
            <p className="text-sm text-danger mb-3">{pacotesError || actionError}</p>
          )}

          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-medium">Pacote</th>
                  <th className="px-4 py-2 font-medium">Inclui</th>
                  <th className="px-4 py-2 font-medium">Preço</th>
                  <th className="px-4 py-2 font-medium">Economia</th>
                  <th className="px-4 py-2 font-medium">Vendidos no mês</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pacotes.map((pac) => (
                  <tr key={pac.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground font-medium">{pac.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pac.itens.map((i) => `${i.quantidade}× ${i.servico}`).join(' + ')}
                      {pac.validade_dias ? ` · vale ${pac.validade_dias} dias` : ''}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrency(pac.preco)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pac.valor_avulso > pac.preco
                        ? `${Math.round(((pac.valor_avulso - pac.preco) / pac.valor_avulso) * 100)}% (avulso ${formatCurrency(pac.valor_avulso)})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{pac.vendidos_mes}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pac.ativo ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted-foreground'}`}>
                        {pac.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {isManager ? (
                        <>
                          <button onClick={() => setEditingPacote(pac)} className="btn-chip">
                            Editar
                          </button>
                          <button
                            onClick={() => togglePacoteAtivo(pac)}
                            className={`btn-chip inline-flex items-center gap-1 ${pac.ativo ? 'btn-chip-perigo' : ''}`}
                          >
                            <Power size={12} />
                            {pac.ativo ? 'Desativar' : 'Ativar'}
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

            {!loadingPacotes && pacotes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum pacote ainda. Crie o primeiro: "pague adiantado, leve mais barato" — o
                dinheiro entra na hora e o cliente volta.
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

          {(productsError || actionError) && (
            <p className="text-sm text-danger mb-3">{productsError || actionError}</p>
          )}

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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted-foreground'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {/* Produto é do gestor — RLS bloqueia o barbeiro, então
                          mostrar os botões para ele era um clique que fingia
                          funcionar. */}
                      {isManager ? (
                        <>
                          <button
                            onClick={() => setRestockingProduct(p)}
                            className="btn-chip btn-chip-primario inline-flex items-center gap-1"
                          >
                            <PackagePlus size={12} />
                            Repor
                          </button>
                          <button onClick={() => setEditingProduct(p)} className="btn-chip">
                            Editar
                          </button>
                          <button
                            onClick={() => toggleProductActive(p)}
                            className={`btn-chip inline-flex items-center gap-1 ${p.ativo ? 'btn-chip-perigo' : ''}`}
                          >
                            <Power size={12} />
                            {p.ativo ? 'Desativar' : 'Ativar'}
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
        <NewPacoteModal
          salonId={salonId}
          pacote={editingPacote === 'new' ? undefined : editingPacote}
          onClose={() => setEditingPacote(null)}
          onSaved={reloadPacotes}
        />
      )}

      {restockingProduct && (
        <ReporEstoqueModal
          product={restockingProduct}
          onClose={() => setRestockingProduct(null)}
          onSaved={reloadProducts}
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
