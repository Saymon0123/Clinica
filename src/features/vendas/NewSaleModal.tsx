import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useSalon } from '../auth/useSalon'
import type { SaleItemDraft } from './types'
import { PAYMENT_LABELS } from './types'

type Option = { id: string; nome: string; preco: number }
type ClientOption = { id: string; nome: string }
type ProfessionalOption = { id: string; nome: string; comissao_percentual: number | null }
type ProductOption = Option & { estoque_atual: number }

export type SalePrefill = {
  appointmentId?: string
  clientId?: string
  professionalId?: string
  serviceId?: string
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function NewSaleModal({
  salonId,
  prefill,
  onClose,
  onSaved,
}: {
  salonId: string
  prefill?: SalePrefill
  onClose: () => void
  onSaved: () => void
}) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [services, setServices] = useState<Option[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])

  const [clientId, setClientId] = useState<string>(prefill?.clientId ?? '')
  const [professionalId, setProfessionalId] = useState<string>(prefill?.professionalId ?? '')
  const [items, setItems] = useState<SaleItemDraft[]>([])
  const [payment, setPayment] = useState<string>('pix')

  const [itemType, setItemType] = useState<'servico' | 'produto'>('servico')
  const [itemRef, setItemRef] = useState('')
  const [itemQty, setItemQty] = useState(1)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { isManager } = useSalon()
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      const [c, p, s, pr] = await Promise.all([
        supabase.from('clients').select('id, nome').eq('salon_id', salonId).order('nome'),
        supabase
          .from('professionals')
          .select('id, nome, comissao_percentual, user_id')
          .eq('salon_id', salonId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('services')
          .select('id, nome, preco')
          .eq('salon_id', salonId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('products')
          .select('id, nome, preco_venda, estoque_atual')
          .eq('salon_id', salonId)
          .eq('ativo', true)
          .order('nome'),
      ])
      setClients(c.data ?? [])

      // O barbeiro só pode lançar venda no próprio nome: a policy
      // `orders: acesso conforme papel` exige `professional_id` entre os dele
      // para quem não é gestor. Oferecer os colegas no seletor levaria a um
      // insert recusado e a um "não foi possível completar a venda" que não
      // explica a causa.
      const todos = (p.data ?? []) as (ProfessionalOption & { user_id: string | null })[]
      const visiveis = isManager ? todos : todos.filter((x) => x.user_id === user?.id)
      setProfessionals(visiveis)
      setServices((s.data ?? []).map((x) => ({ id: x.id, nome: x.nome, preco: Number(x.preco) })))
      setProducts(
        (pr.data ?? []).map((x) => ({
          id: x.id,
          nome: x.nome,
          preco: Number(x.preco_venda ?? 0),
          estoque_atual: x.estoque_atual,
        })),
      )

      if (!prefill?.professionalId && visiveis.length > 0) {
        setProfessionalId(visiveis[0].id)
      }
      // Pré-adiciona o serviço do agendamento, se veio da agenda
      if (prefill?.serviceId && s.data) {
        const svc = s.data.find((x) => x.id === prefill.serviceId)
        if (svc) {
          setItems([
            {
              tipo: 'servico',
              refId: svc.id,
              nome: svc.nome,
              quantidade: 1,
              preco_unitario: Number(svc.preco),
            },
          ])
        }
      }
    }
    load()
  }, [salonId, prefill, isManager, user?.id])

  const total = useMemo(
    () => items.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0),
    [items],
  )

  function addItem() {
    if (!itemRef) return
    const source = itemType === 'servico' ? services : products
    const opt = source.find((o) => o.id === itemRef)
    if (!opt) return

    if (itemType === 'produto') {
      const prod = opt as ProductOption
      const alreadyInCart = items
        .filter((i) => i.tipo === 'produto' && i.refId === prod.id)
        .reduce((acc, i) => acc + i.quantidade, 0)
      if (alreadyInCart + itemQty > prod.estoque_atual) {
        setError(`Estoque insuficiente de "${prod.nome}" (disponível: ${prod.estoque_atual}).`)
        return
      }
    }

    setError(null)
    setItems((prev) => [
      ...prev,
      { tipo: itemType, refId: opt.id, nome: opt.nome, quantidade: itemQty, preco_unitario: opt.preco },
    ])
    setItemRef('')
    setItemQty(1)
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (items.length === 0) {
      setError('Adicione ao menos um item à venda.')
      return
    }
    if (!professionalId) {
      setError('Selecione o profissional.')
      return
    }

    setSaving(true)
    setError(null)

    // 1. Cria a comanda já fechada
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        salon_id: salonId,
        client_id: clientId || null,
        professional_id: professionalId,
        appointment_id: prefill?.appointmentId ?? null,
        status: 'fechada',
        closed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Erro ao criar venda:', orderError)
      setError('Não foi possível registrar a venda. Tente novamente.')
      setSaving(false)
      return
    }

    try {
      // 2. Itens
      const { data: insertedItems, error: itemsError } = await supabase
        .from('order_items')
        .insert(
          items.map((i) => ({
            order_id: order.id,
            tipo: i.tipo,
            service_id: i.tipo === 'servico' ? i.refId : null,
            product_id: i.tipo === 'produto' ? i.refId : null,
            professional_id: professionalId,
            quantidade: i.quantidade,
            preco_unitario: i.preco_unitario,
          })),
        )
        .select('id, tipo, service_id, quantidade, preco_unitario')
      if (itemsError || !insertedItems) throw itemsError ?? new Error('Falha nos itens')

      // 3. Pagamento
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: order.id,
        forma_pagamento: payment,
        valor: total,
      })
      if (paymentError) throw paymentError

      // 4. Baixa de estoque dos produtos vendidos
      for (const i of items.filter((x) => x.tipo === 'produto')) {
        await supabase.from('stock_movements').insert({
          product_id: i.refId,
          tipo: 'saida',
          quantidade: i.quantidade,
          motivo: 'venda',
        })
        const prod = products.find((p) => p.id === i.refId)
        if (prod) {
          await supabase
            .from('products')
            .update({ estoque_atual: Math.max(prod.estoque_atual - i.quantidade, 0) })
            .eq('id', i.refId)
        }
      }

      // 5. Comissão sobre serviços (se o profissional tiver percentual)
      const prof = professionals.find((p) => p.id === professionalId)
      const pct = prof?.comissao_percentual != null ? Number(prof.comissao_percentual) : null
      if (pct && pct > 0) {
        const serviceItems = insertedItems.filter((i) => i.tipo === 'servico')
        if (serviceItems.length > 0) {
          await supabase.from('commissions').insert(
            serviceItems.map((i) => ({
              professional_id: professionalId,
              order_item_id: i.id,
              percentual_aplicado: pct,
              valor_calculado: (Number(i.preco_unitario) * i.quantidade * pct) / 100,
            })),
          )
        }
      }

      // 6. Se veio de um agendamento, marca como concluído
      if (prefill?.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'concluido' })
          .eq('id', prefill.appointmentId)
      }

      onSaved()
    } catch (err) {
      console.error('Erro ao completar venda, desfazendo:', err)
      // Desfaz a comanda (cascade remove itens/pagamentos)
      await supabase.from('orders').delete().eq('id', order.id)
      setError('Não foi possível completar a venda. Nada foi salvo, tente novamente.')
      setSaving(false)
    }
  }

  const currentOptions = itemType === 'servico' ? services : products

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Nova venda</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Cliente (opcional)</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
              >
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Profissional</span>
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Adição de itens */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Adicionar item</span>
            <div className="flex flex-wrap gap-2">
              <select
                value={itemType}
                onChange={(e) => {
                  setItemType(e.target.value as 'servico' | 'produto')
                  setItemRef('')
                }}
                className="border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
              >
                <option value="servico">Serviço</option>
                <option value="produto">Produto</option>
              </select>

              <select
                value={itemRef}
                onChange={(e) => setItemRef(e.target.value)}
                className="flex-1 min-w-36 border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {currentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome} — {formatCurrency(o.preco)}
                    {itemType === 'produto' ? ` (${(o as ProductOption).estoque_atual} em estoque)` : ''}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={itemQty}
                onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
                className="w-16 border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
                aria-label="Quantidade"
              />

              <button
                onClick={addItem}
                type="button"
                className="flex items-center gap-1 btn-primary rounded px-3 py-2 text-sm font-medium"
              >
                <Plus size={14} />
                Adicionar
              </button>
            </div>
          </div>

          {/* Lista de itens */}
          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((i, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 bg-surface-2 rounded px-3 py-2 text-sm"
                >
                  <span className="text-foreground truncate">
                    {i.quantidade}× {i.nome}
                    <span className="text-muted-foreground"> · {i.tipo === 'servico' ? 'Serviço' : 'Produto'}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-medium text-foreground">
                      {formatCurrency(i.quantidade * i.preco_unitario)}
                    </span>
                    <button
                      onClick={() => removeItem(idx)}
                      aria-label={`Remover ${i.nome}`}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Forma de pagamento</span>
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
              >
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-right">
              <span className="text-xs text-muted-foreground">Total</span>
              <div className="text-2xl font-semibold text-foreground">{formatCurrency(total)}</div>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              type="button"
              className="flex-1 border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || items.length === 0}
              type="button"
              className="flex-1 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Salvando...' : `Finalizar venda`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
