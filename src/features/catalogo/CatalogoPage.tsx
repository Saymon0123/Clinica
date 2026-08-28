import { useEffect, useState } from 'react'
import { Boxes, Lock, Package, PackagePlus, Plus, Power, Tag } from 'lucide-react'
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
import { Tabela, Th, Linha, Td } from '../../components/Tabela'
import { Badge } from '../../components/Badge'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonPagina } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import type { ServiceItem, ProductItem } from './types'
import { ErroInline } from '../../components/ErroInline'

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
    return <SkeletonPagina />
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
      <PageHeader
        titulo="Catálogo"
        subtitulo="Serviços, produtos e pacotes à venda"
        acoes={
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
        }
      />

      {/* key={tab} remonta o wrapper na troca e dispara a entrada animada. */}
      <div key={tab} className="aba-entra">
      {tab === 'servicos' ? (
        <div>
          {/* Barbeiro também acrescenta serviço; só não mexe no que não é dele. */}
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditingService('new')}
              className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
            >
              <Plus size={16} />
              Novo serviço
            </button>
          </div>

          {(servicesError || actionError) && (
            <div className="mb-3"><ErroInline>{servicesError || actionError}</ErroInline></div>
          )}

          {!loadingServices && services.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border shadow-sm">
              <EstadoVazio
                icone={Tag}
                titulo="Nenhum serviço cadastrado ainda."
                descricao="Os serviços cadastrados aqui aparecem na agenda e nas vendas."
                acao={
                  <button
                    onClick={() => setEditingService('new')}
                    className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    <Plus size={16} />
                    Novo serviço
                  </button>
                }
              />
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Serviço</Th>
                  <Th>Duração</Th>
                  <Th>Preço</Th>
                  <Th title="Vendas de comandas fechadas no mês corrente">Vendas no mês</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <Linha key={s.id}>
                    <Td className="text-foreground font-medium">{s.nome}</Td>
                    <Td className="text-muted-foreground">{s.duracao_minutos} min</Td>
                    <Td className="text-muted-foreground">{formatCurrency(s.preco)}</Td>
                    <Td className="text-muted-foreground">{s.vendas_mes}</Td>
                    <Td>
                      <Badge variante={s.ativo ? 'ok' : 'neutro'}>{s.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </Td>
                    <Td className="text-right space-x-2">
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
                          <Lock size={12} />
                          Da gestão
                        </span>
                      )}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      ) : tab === 'pacotes' ? (
        <div>
          {isManager && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingPacote('new')}
                className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
              >
                <Plus size={16} />
                Novo pacote
              </button>
            </div>
          )}

          {(pacotesError || actionError) && (
            <div className="mb-3"><ErroInline>{pacotesError || actionError}</ErroInline></div>
          )}

          {!loadingPacotes && pacotes.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border shadow-sm">
              <EstadoVazio
                icone={Boxes}
                titulo="Nenhum pacote ainda."
                descricao={
                  <>
                    Crie o primeiro: "pague adiantado, leve mais barato" — o dinheiro entra na hora e
                    o cliente volta.
                  </>
                }
                acao={
                  isManager ? (
                    <button
                      onClick={() => setEditingPacote('new')}
                      className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
                    >
                      <Plus size={16} />
                      Novo pacote
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Pacote</Th>
                  <Th>Inclui</Th>
                  <Th>Preço</Th>
                  <Th>Economia</Th>
                  <Th>Vendidos no mês</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {pacotes.map((pac) => (
                  <Linha key={pac.id}>
                    <Td className="text-foreground font-medium">{pac.nome}</Td>
                    <Td className="text-muted-foreground">
                      {pac.itens.map((i) => `${i.quantidade}× ${i.servico}`).join(' + ')}
                      {pac.validade_dias ? ` · vale ${pac.validade_dias} dias` : ''}
                    </Td>
                    <Td className="text-muted-foreground">{formatCurrency(pac.preco)}</Td>
                    <Td className="text-muted-foreground">
                      {pac.valor_avulso > pac.preco
                        ? `${Math.round(((pac.valor_avulso - pac.preco) / pac.valor_avulso) * 100)}% (avulso ${formatCurrency(pac.valor_avulso)})`
                        : '—'}
                    </Td>
                    <Td className="text-muted-foreground">{pac.vendidos_mes}</Td>
                    <Td>
                      <Badge variante={pac.ativo ? 'ok' : 'neutro'}>{pac.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </Td>
                    <Td className="text-right space-x-2 whitespace-nowrap">
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
                          <Lock size={12} />
                          Da gestão
                        </span>
                      )}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      ) : (
        <div>
          {isManager && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditingProduct('new')}
                className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
              >
                <Plus size={16} />
                Novo produto
              </button>
            </div>
          )}

          {(productsError || actionError) && (
            <div className="mb-3"><ErroInline>{productsError || actionError}</ErroInline></div>
          )}

          {!loadingProducts && products.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border shadow-sm">
              <EstadoVazio
                icone={Package}
                titulo="Nenhum produto cadastrado ainda."
                descricao="Cadastre os produtos que ficam à venda no balcão para controlar o estoque."
                acao={
                  isManager ? (
                    <button
                      onClick={() => setEditingProduct('new')}
                      className="flex items-center gap-2 btn-primary rounded-lg px-4 py-2 text-sm font-medium"
                    >
                      <Plus size={16} />
                      Novo produto
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Preço de venda</Th>
                  <Th>Estoque</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <Linha key={p.id}>
                    <Td className="text-foreground font-medium">{p.nome}</Td>
                    <Td className="text-muted-foreground">{formatCurrency(p.preco_venda)}</Td>
                    <Td className="text-muted-foreground">
                      {p.estoque_atual}
                      {p.estoque_atual <= p.estoque_minimo && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">baixo</span>
                      )}
                    </Td>
                    <Td>
                      <Badge variante={p.ativo ? 'ok' : 'neutro'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </Td>
                    <Td className="text-right space-x-2 whitespace-nowrap">
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
                          <Lock size={12} />
                          Da gestão
                        </span>
                      )}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      )}
      </div>

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
