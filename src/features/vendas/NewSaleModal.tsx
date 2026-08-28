import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { useSalon } from '../auth/useSalon'
import type { SaleItemDraft } from './types'
import { PAYMENT_LABELS } from './types'

type Option = { id: string; nome: string; preco: number }
type ClientOption = { id: string; nome: string }
type ProfessionalOption = { id: string; nome: string; comissao_percentual: number | null }
type ProductOption = Option & { estoque_atual: number }
type PacoteOption = {
  id: string
  nome: string
  preco: number
  validade_dias: number | null
  itens: { service_id: string; quantidade: number; servico: string }[]
}
type SaldoPacote = {
  pacote_do_cliente_id: string
  pacote: string
  service_id: string
  servico: string
  contratado: number
  consumido: number
  restante: number
  expira_em: string | null
  vencido: boolean
}

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

  const [itemType, setItemType] = useState<'servico' | 'produto' | 'pacote'>('servico')
  const [itemRef, setItemRef] = useState('')
  const [itemQty, setItemQty] = useState(1)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { isManager } = useSalon()
  const { user } = useAuth()

  /**
   * Pacotes pré-pagos (2026-08-26, no lugar do cartão de carimbos).
   *
   * `pacotesDoSalao` são os modelos à venda (montados no Catálogo). `saldos`
   * é o que ESTE cliente ainda tem para usar — contado pela view
   * `saldo_de_pacotes`, nunca guardado, então desfazer comanda devolve
   * crédito sozinho.
   */
  const [pacotesDoSalao, setPacotesDoSalao] = useState<PacoteOption[]>([])
  const [saldos, setSaldos] = useState<SaldoPacote[]>([])

  /**
   * "Quer que a gente te avise quando der tempo de voltar?"
   *
   * **Vem marcado de propósito**, e isso é uma decisão de negócio: o barbeiro
   * se encarrega de dizer ao cliente que a mensagem vai chegar. É essa fala no
   * balcão que torna verdadeira a frase "você pediu para que te avisássemos" —
   * e é ela que faz a mensagem custar ~R$ 0,04 (utilidade) em vez de ~R$ 0,35
   * (marketing), porque a Meta classifica pela existência de uma ação anterior
   * do cliente.
   *
   * O texto ao lado não é enfeite: é o roteiro do que o barbeiro precisa dizer.
   * Sem essa frase dita em voz alta, o cliente recebe uma mensagem afirmando
   * algo que ele não fez, estranha, e bloqueia — e bloqueio derruba a nota do
   * número, que derruba o alcance dos lembretes.
   */
  const [avisarRetorno, setAvisarRetorno] = useState(true)

  /**
   * Agendamento automático (reativação): o barbeiro pergunta em voz alta
   * "de quanto em quanto tempo você corta?" e digita em semanas. Preencher
   * é o opt-in — o sistema passa a reservar o próximo horário sozinho e
   * confirmar por WhatsApp 1 dia antes. Vazio = fora da base.
   */
  const [reativacaoSemanas, setReativacaoSemanas] = useState('')

  useEffect(() => {
    if (!clientId) {
      setReativacaoSemanas('')
      return
    }
    let cancelado = false
    supabase
      .from('clients')
      .select('reativacao_semanas')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        if (!cancelado)
          setReativacaoSemanas(data?.reativacao_semanas ? String(data.reativacao_semanas) : '')
      })
    return () => {
      cancelado = true
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) {
      setSaldos([])
      return
    }
    let cancelado = false
    supabase
      .from('saldo_de_pacotes')
      .select('pacote_do_cliente_id, pacote, service_id, servico, contratado, consumido, restante, expira_em, vencido')
      .eq('client_id', clientId)
      .then(({ data }) => {
        if (!cancelado) setSaldos(((data ?? []) as SaldoPacote[]).filter((x) => !x.vencido))
      })
    return () => {
      cancelado = true
    }
  }, [clientId])

  useEffect(() => {
    async function load() {
      const [c, p, s, pr, pk] = await Promise.all([
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
        supabase
          .from('pacotes')
          .select('id, nome, preco, validade_dias, pacote_itens(service_id, quantidade, services(nome))')
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

      type LinhaPacote = {
        id: string
        nome: string
        preco: number
        validade_dias: number | null
        pacote_itens: { service_id: string; quantidade: number; services: { nome: string } | { nome: string }[] | null }[]
      }
      setPacotesDoSalao(
        ((pk.data ?? []) as unknown as LinhaPacote[]).map((x) => ({
          id: x.id,
          nome: x.nome,
          preco: Number(x.preco),
          validade_dias: x.validade_dias,
          itens: (x.pacote_itens ?? []).map((i) => ({
            service_id: i.service_id,
            quantidade: i.quantidade,
            servico: (Array.isArray(i.services) ? i.services[0]?.nome : i.services?.nome) ?? 'Serviço',
          })),
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
    if (itemType === 'pacote') {
      const pacote = pacotesDoSalao.find((x) => x.id === itemRef)
      if (!pacote) return
      // Pacote sem cliente seria crédito sem dono — não há a quem creditar.
      if (!clientId) {
        setError('Escolha o cliente antes de vender um pacote — o crédito fica no nome dele.')
        return
      }
      setError(null)
      setItems((prev) => [
        ...prev,
        {
          tipo: 'pacote',
          refId: pacote.id,
          nome: `Pacote: ${pacote.nome}`,
          quantidade: 1,
          preco_unitario: pacote.preco,
          uid: crypto.randomUUID(),
        },
      ])
      setItemRef('')
      setItemQty(1)
      return
    }
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
    setItems((prev) => {
      const alvo = prev[index]
      // Tirar um pacote da comanda leva junto os consumos que dependiam dele.
      if (alvo?.tipo === 'pacote' && alvo.uid) {
        return prev.filter((it, i) => i !== index && it.viaPacoteNovo !== alvo.uid)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  /**
   * Consome 1 crédito do pacote do cliente: o serviço entra na comanda a R$0,
   * marcado com o pacote que o paga. A comissão foi paga na VENDA do pacote —
   * o consumo não comissiona de novo (decisão de 26/08).
   */
  function usarDoPacote(saldo: SaldoPacote) {
    const jaUsados = items.filter(
      (i) => i.viaPacote === saldo.pacote_do_cliente_id && i.refId === saldo.service_id,
    ).length
    if (jaUsados >= saldo.restante) {
      setError(`O pacote só tem ${saldo.restante} de ${saldo.servico} restante${saldo.restante === 1 ? '' : 's'}.`)
      return
    }
    setError(null)
    setItems((prev) => [
      ...prev,
      {
        tipo: 'servico',
        refId: saldo.service_id,
        nome: `${saldo.servico} (pacote)`,
        quantidade: 1,
        preco_unitario: 0,
        viaPacote: saldo.pacote_do_cliente_id,
      },
    ])
  }

  /**
   * Consome um crédito de um pacote que está sendo COMPRADO nesta comanda —
   * o caso clássico do balcão: "então já fecha o pacote e desconta o corte de
   * hoje". O vínculo é pelo uid local; ao finalizar, o consumo aponta para o
   * pacote recém-criado.
   */
  function usarDoPacoteDaComanda(uidPacote: string, servico: { service_id: string; servico: string; quantidade: number }) {
    const jaUsados = items.filter(
      (i) => i.viaPacoteNovo === uidPacote && i.refId === servico.service_id,
    ).length
    if (jaUsados >= servico.quantidade) {
      setError(`Esse pacote só tem ${servico.quantidade} de ${servico.servico}.`)
      return
    }
    setError(null)
    setItems((prev) => [
      ...prev,
      {
        tipo: 'servico',
        refId: servico.service_id,
        nome: `${servico.servico} (pacote)`,
        quantidade: 1,
        preco_unitario: 0,
        viaPacoteNovo: uidPacote,
      },
    ])
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

    // Movimentos de estoque desta venda, para o rollback poder apagá-los —
    // eles não caem no cascade da comanda.
    let movimentosInseridos: string[] = []

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

      // 4. Baixa de estoque dos produtos vendidos.
      //
      // Só o MOVIMENTO é gravado: o saldo em products é atualizado por trigger
      // no banco (0109), atômico — duas vendas simultâneas não se sobrescrevem
      // mais. Os ids ficam guardados para o rollback: apagar o movimento faz o
      // trigger devolver o estoque.
      const produtosVendidos = items.filter((x) => x.tipo === 'produto')
      if (produtosVendidos.length > 0) {
        const { data: movs, error: stockError } = await supabase
          .from('stock_movements')
          .insert(
            produtosVendidos.map((i) => ({
              product_id: i.refId,
              tipo: 'saida',
              quantidade: i.quantidade,
              motivo: 'venda',
            })),
          )
          .select('id')
        if (stockError || !movs) throw stockError ?? new Error('Falha na baixa de estoque')
        movimentosInseridos = movs.map((m) => m.id as string)
      }

      // 5. Comissão sobre serviços (se o profissional tiver percentual)
      const prof = professionals.find((p) => p.id === professionalId)
      const pct = prof?.comissao_percentual != null ? Number(prof.comissao_percentual) : null
      if (pct && pct > 0) {
        // Comissão na VENDA do pacote (percentual sobre o valor vendido) e
        // nos serviços avulsos. Consumo de pacote entra a R$0 e cai fora
        // pelo próprio valor.
        const serviceItems = insertedItems.filter(
          (i) => (i.tipo === 'servico' || i.tipo === 'pacote') && Number(i.preco_unitario) > 0,
        )
        if (serviceItems.length > 0) {
          const { error: commError } = await supabase.from('commissions').insert(
            serviceItems.map((i) => ({
              professional_id: professionalId,
              order_item_id: i.id,
              percentual_aplicado: pct,
              valor_calculado: (Number(i.preco_unitario) * i.quantidade * pct) / 100,
            })),
          )
          if (commError) throw commError
        }
      }

      // 6. Pacotes: a venda cria o crédito do cliente; o consumo debita.
      //
      // Tudo amarrado à comanda: cancelou a venda, o pacote some (cascade via
      // order_id) e os consumos voltam (cascade via order_item_id).
      const pacotesVendidos = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.tipo === 'pacote')
      // uid local → id real do pacote criado, para os consumos da mesma comanda.
      const pacoteCriadoPorUid = new Map<string, string>()
      for (const { item } of pacotesVendidos) {
        const modelo = pacotesDoSalao.find((x) => x.id === item.refId)
        const expira = modelo?.validade_dias
          ? new Date(Date.now() + modelo.validade_dias * 86400000).toISOString().slice(0, 10)
          : null
        const { data: criado, error: pacoteError } = await supabase
          .from('pacotes_do_cliente')
          .insert({
            salon_id: salonId,
            client_id: clientId,
            pacote_id: item.refId,
            order_id: order.id,
            preco_pago: item.preco_unitario,
            expira_em: expira,
          })
          .select('id')
          .single()
        if (pacoteError || !criado) throw pacoteError ?? new Error('Falha ao criar o pacote do cliente.')
        if (item.uid) pacoteCriadoPorUid.set(item.uid, criado.id)
      }

      const consumos = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.viaPacote || item.viaPacoteNovo)
      if (consumos.length > 0) {
        // insertedItems volta na ordem do insert — o índice casa item ↔ id.
        const { error: consumoError } = await supabase.from('pacote_consumos').insert(
          consumos.map(({ item, idx }) => ({
            pacote_do_cliente_id: item.viaPacote ?? pacoteCriadoPorUid.get(item.viaPacoteNovo!)!,
            service_id: item.refId,
            order_item_id: insertedItems[idx].id,
          })),
        )
        if (consumoError) throw consumoError
      }

      // 7. Aviso de retorno: registra a preferência E o momento em que ela foi
      // confirmada num caixa.
      //
      // A data é o que importa. Ela é a diferença entre "esse cliente foi
      // avisado, com o barbeiro na frente dele" e "esse cliente nunca ouviu
      // falar disso" — e é ela que decide se a mensagem pode dizer "você pediu
      // para que te avisássemos". Sem a data, o default `true` da coluna
      // reivindicaria consentimento da base inteira, retroativamente.
      const semanasNum = parseInt(reativacaoSemanas, 10)
      const semanasValidas = Number.isInteger(semanasNum) && semanasNum >= 1 && semanasNum <= 8
      if (clientId) {
        const { error: avisoError } = await supabase
          .from('clients')
          .update({
            quer_aviso_de_retorno: avisarRetorno,
            aviso_de_retorno_em: new Date().toISOString(),
            // Agendamento automático: número novo renova o opt-in e zera
            // pausa/contadores; campo vazio tira o cliente da base.
            reativacao_semanas: semanasValidas ? semanasNum : null,
            ...(semanasValidas
              ? { reativacao_pausada_em: null, reativacao_sem_resposta: 0, reativacao_no_shows: 0 }
              : {}),
          })
          .eq('id', clientId)
        // Preferência de aviso não é motivo para desfazer uma venda inteira —
        // mas também não pode falhar em silêncio absoluto.
        if (avisoError) console.error('Preferência de aviso não salvou:', avisoError)
      }

      // 8. Se veio de um agendamento, marca como concluído. Fatal de
      // propósito: venda sem agendamento concluído deixaria o cron cancelar
      // um horário que foi atendido e pago.
      if (prefill?.appointmentId) {
        const { error: apptError } = await supabase
          .from('appointments')
          .update({ status: 'concluido' })
          .eq('id', prefill.appointmentId)
        if (apptError) throw apptError
      }

      toast('Venda registrada')
      onSaved()
    } catch (err) {
      console.error('Erro ao completar venda, desfazendo:', err)
      // Desfaz TUDO: a comanda (cascade leva itens, pagamento, comissões e
      // resgate) e os movimentos de estoque (o trigger devolve o saldo).
      if (movimentosInseridos.length > 0) {
        await supabase.from('stock_movements').delete().in('id', movimentosInseridos)
      }
      await supabase.from('orders').delete().eq('id', order.id)
      setError('Não foi possível completar a venda. Nada foi salvo, tente novamente.')
      setSaving(false)
    }
  }

  const currentOptions =
    itemType === 'servico'
      ? services
      : itemType === 'produto'
        ? products
        : pacotesDoSalao.map((x) => ({
            id: x.id,
            nome: `${x.nome} (${x.itens.map((i) => `${i.quantidade}× ${i.servico}`).join(' + ')})`,
            preco: x.preco,
          }))

  return (
    <Modal onClose={onClose} titulo="Nova venda" tamanho="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Cliente (opcional)</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
              >
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>

            {clientId && (
              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5">
                <input
                  type="checkbox"
                  checked={avisarRetorno}
                  onChange={(e) => setAvisarRetorno(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-sm text-foreground">
                  Avisar quando der tempo de voltar
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Fale com ele agora: <em>“quer que a gente te avise daqui a umas semanas?”</em>{' '}
                    Se ele não quiser, desmarque. Mensagem para quem não foi avisado vira reclamação
                    — e bloqueio derruba o alcance dos lembretes.
                  </span>
                </span>
              </label>
            )}

            {clientId && (
              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5 sm:col-span-2">
                <input
                  type="number"
                  min={1}
                  max={8}
                  inputMode="numeric"
                  value={reativacaoSemanas}
                  onChange={(e) => setReativacaoSemanas(e.target.value)}
                  placeholder="—"
                  className="mt-0.5 w-14 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-1 text-sm text-center"
                />
                <span className="text-sm text-foreground">
                  Agendamento automático: corta a cada quantas semanas?
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Pergunte agora: <em>“de quanto em quanto tempo você corta? Quer que eu já
                    deixe o próximo horário reservado?”</em> Com o número preenchido, o sistema
                    reserva o mesmo dia e horário e confirma com ele no WhatsApp 1 dia antes.
                    Deixe vazio se ele não quiser.
                  </span>
                </span>
              </label>
            )}

            {/* Logo abaixo do cliente: é ao escolher quem está na cadeira que
                o barbeiro precisa saber do pacote. */}
            {/* Pacotes sendo comprados NESTA comanda: os créditos já podem
                pagar o atendimento de hoje — "fecha o pacote e desconta o
                corte de agora". */}
            {items.filter((i) => i.tipo === 'pacote' && i.uid).map((pacItem) => {
              const modelo = pacotesDoSalao.find((x) => x.id === pacItem.refId)
              if (!modelo) return null
              return (
                <div
                  key={pacItem.uid}
                  className="rounded-lg border border-success/40 bg-success-soft p-2.5 space-y-1.5 text-sm"
                >
                  {modelo.itens.map((sv) => {
                    const usados = items.filter(
                      (i) => i.viaPacoteNovo === pacItem.uid && i.refId === sv.service_id,
                    ).length
                    return (
                      <div key={sv.service_id} className="flex items-center justify-between gap-3">
                        <span className="text-foreground min-w-0 truncate">
                          <strong>{modelo.nome}</strong> (nesta venda): {sv.quantidade - usados} de{' '}
                          {sv.quantidade} {sv.servico}
                        </span>
                        {sv.quantidade - usados > 0 && (
                          <button
                            type="button"
                            onClick={() => usarDoPacoteDaComanda(pacItem.uid!, sv)}
                            className="shrink-0 btn-chip btn-chip-primario"
                          >
                            Descontar o de hoje
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {saldos.length > 0 && (
              <div className="rounded-lg border border-primary/40 bg-primary-soft/30 p-2.5 space-y-1.5 text-sm">
                {saldos.map((sal) => {
                  const naComanda = items.filter(
                    (i) => i.viaPacote === sal.pacote_do_cliente_id && i.refId === sal.service_id,
                  ).length
                  const disponivel = sal.restante - naComanda
                  return (
                    <div
                      key={`${sal.pacote_do_cliente_id}-${sal.service_id}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-foreground min-w-0 truncate">
                        <strong>{sal.pacote}</strong>: restam {disponivel} de {sal.contratado}{' '}
                        {sal.servico}
                        {sal.expira_em && (
                          <span className="text-muted-foreground">
                            {' '}· vence {sal.expira_em.split('-').reverse().join('/')}
                          </span>
                        )}
                      </span>
                      {disponivel > 0 && (
                        <button
                          type="button"
                          onClick={() => usarDoPacote(sal)}
                          className="shrink-0 btn-chip btn-chip-primario"
                        >
                          Usar 1 do pacote
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Profissional</span>
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
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
                  setItemType(e.target.value as 'servico' | 'produto' | 'pacote')
                  setItemRef('')
                }}
                className="border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
              >
                <option value="servico">Serviço</option>
                <option value="produto">Produto</option>
                {pacotesDoSalao.length > 0 && <option value="pacote">Pacote</option>}
              </select>

              <select
                value={itemRef}
                onChange={(e) => setItemRef(e.target.value)}
                className="flex-1 min-w-36 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
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
                className="w-16 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
                aria-label="Quantidade"
              />

              <button
                onClick={addItem}
                type="button"
                className="flex items-center gap-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium"
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
                  className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm"
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
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm"
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
              className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || items.length === 0}
              type="button"
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Salvando...' : `Finalizar venda`}
            </button>
          </div>
        </div>
    </Modal>
  )
}
