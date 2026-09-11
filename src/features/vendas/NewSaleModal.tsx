import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Campo, Select } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
import { gerarId } from '../../lib/id'
import { inicioDoDia } from '../../lib/periodo'
import { toast } from '../../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { useSalon } from '../auth/useSalon'
import type { AppointmentStatus } from '../agenda/types'
import type { SaleItemDraft } from './types'
import { PAYMENT_LABELS } from './types'
import { ErroInline } from '../../components/ErroInline'
import {
  faltaOuSobra,
  itemComPrecoValido,
  lerValor,
  pagamentosDaComanda,
  restante,
  type LinhaDePagamento,
} from './pagamentos'
import {
  FalhaAoConcluirHorario,
  SEM_LINHA,
  STATUS_QUE_A_VENDA_CONCLUI,
  faltaResponder,
  horaLocal,
  mensagemDeFalhaNoVinculo,
  perguntaDoVinculo,
  rotuloDoHorario,
  type HorarioDoDia,
} from './vinculoDeHorario'

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
  /** Serviços combinados no mesmo agendamento (item 6). Quando tem 2+, cada um vira um item da comanda; `serviceId` continua sendo o principal, mantido por compatibilidade. */
  serviceIds?: string[]
  /** Hora do horário na agenda ('14:00'), para a comanda mostrar de qual horário ela é. */
  horaLocal?: string
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
  /**
   * Pagamento dividido (achado 41 da revisão de 01/09). Uma linha = uma
   * forma com o total; mais linhas = cada uma com o seu valor, e a última se
   * preenche sozinha com o que falta.
   */
  const [pagamentos, setPagamentos] = useState<LinhaDePagamento[]>([{ forma: 'pix', valor: '' }])

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

  /**
   * De qual horário da agenda esta venda é (A7 do giro de 10/09, plano C).
   *
   * A presença é deduzida: 15 minutos depois do fim previsto, horário sem
   * venda vira "não veio" (0153). Então toda venda que pertence a um horário
   * precisa dizer qual. Duas portas levam ao vínculo: o "Concluir e cobrar" da
   * agenda (já chega vinculado — `origem: 'agenda'`) e a pergunta que esta tela
   * faz quando o cliente escolhido tem horário hoje (`origem: 'sugestao'`).
   */
  type Vinculo = { id: string; hora: string | null; origem: 'agenda' | 'sugestao' }
  const [vinculo, setVinculo] = useState<Vinculo | null>(
    prefill?.appointmentId
      ? { id: prefill.appointmentId, hora: prefill.horaLocal ?? null, origem: 'agenda' }
      : null,
  )
  /** "Não, é outra venda" — resposta explícita; sem nenhuma das duas, a venda não sai. */
  const [semVinculo, setSemVinculo] = useState(false)
  const [horariosDoDia, setHorariosDoDia] = useState<HorarioDoDia[]>([])
  const [conferindoHorarios, setConferindoHorarios] = useState(false)

  // Horários de HOJE do cliente escolhido que esta venda pode estar pagando.
  // A RLS já recorta: o barbeiro só enxerga os horários dele, que são os
  // únicos que ele conseguiria concluir. Falha aqui não trava a venda — sem a
  // lista, a pergunta só não aparece.
  useEffect(() => {
    if (!clientId) {
      setHorariosDoDia([])
      setConferindoHorarios(false)
      return
    }
    let cancelado = false
    setConferindoHorarios(true)
    const hoje = inicioDoDia()
    const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
    supabase
      .from('appointments')
      .select('id, data_hora_inicio, status, professional_id, professionals(nome)')
      .eq('salon_id', salonId)
      .eq('client_id', clientId)
      .in('status', [...STATUS_QUE_A_VENDA_CONCLUI])
      .gte('data_hora_inicio', hoje.toISOString())
      .lt('data_hora_inicio', amanha.toISOString())
      .order('data_hora_inicio')
      .then(({ data, error: erroHorarios }) => {
        if (cancelado) return
        if (erroHorarios) console.error('Erro ao buscar os horários de hoje do cliente:', erroHorarios)
        type Linha = {
          id: string
          data_hora_inicio: string
          status: AppointmentStatus
          professional_id: string
          professionals: { nome: string } | { nome: string }[] | null
        }
        setHorariosDoDia(
          ((data ?? []) as unknown as Linha[]).map((l) => ({
            id: l.id,
            inicio: l.data_hora_inicio,
            status: l.status,
            professionalId: l.professional_id,
            barbeiro: (Array.isArray(l.professionals) ? l.professionals[0]?.nome : l.professionals?.nome) ?? null,
          })),
        )
        setConferindoHorarios(false)
      })
    return () => {
      cancelado = true
    }
  }, [clientId, salonId])

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
      // Pré-adiciona o(s) serviço(s) do agendamento, se veio da agenda.
      // Com 2+ em serviceIds (corte + barba no mesmo horário), um item por
      // serviço; senão cai no comportamento antigo, só o principal.
      const idsParaPrefill =
        prefill?.serviceIds && prefill.serviceIds.length > 1
          ? prefill.serviceIds
          : prefill?.serviceId
            ? [prefill.serviceId]
            : []
      if (idsParaPrefill.length > 0 && s.data) {
        const itensPrefill = idsParaPrefill
          .map((id) => s.data!.find((x) => x.id === id))
          .filter((svc): svc is NonNullable<typeof svc> => Boolean(svc))
          .map((svc) => ({
            chave: gerarId(),
            tipo: 'servico' as const,
            refId: svc.id,
            nome: svc.nome,
            quantidade: 1,
            preco_unitario: Number(svc.preco),
          }))
        if (itensPrefill.length > 0) setItems(itensPrefill)
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
      if (!(Number(pacote.preco) > 0)) {
        setError(`"${pacote.nome}" está sem preço no catálogo. Corrija em Catálogo antes de vender.`)
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
          uid: gerarId(),
          chave: gerarId(),
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

    // Nada sai a R$ 0,00 por acidente (achado 14 da revisão de 01/09). O item
    // herda o preço do catálogo; produto ou serviço gravado sem preço virava
    // linha a zero na comanda, e a comanda fechava assim — sem comissão, sem
    // faturamento, sem aviso. O único zero legítimo aqui é o consumo de pacote
    // (`viaPacote`/`viaPacoteNovo`), que não passa por esta função: o cliente
    // já pagou antes. O catálogo também recusa zero desde a 0132; esta linha
    // é para o cadastro que entrou antes dela.
    if (!(Number(opt.preco) > 0)) {
      setError(
        `"${opt.nome}" está sem preço no catálogo. Corrija em Catálogo antes de vender — ` +
          'o único item a R$ 0,00 que a comanda aceita é o consumo de pacote.',
      )
      return
    }

    setError(null)
    setItems((prev) => [
      ...prev,
      { chave: gerarId(), tipo: itemType, refId: opt.id, nome: opt.nome, quantidade: itemQty, preco_unitario: opt.preco },
    ])
    setItemRef('')
    setItemQty(1)
  }

  /**
   * Preço editável por item (achado 41): "R$ 5 de desconto" era feito mudando
   * o preço no catálogo — para todo mundo. O consumo de pacote não passa por
   * aqui (fica a R$ 0, o cliente já pagou).
   */
  function alterarPreco(index: number, texto: string) {
    const valor = lerValor(texto)
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, preco_unitario: Number.isFinite(valor) ? valor : 0 } : it)),
    )
  }

  function alterarPagamento(index: number, mudanca: Partial<LinhaDePagamento>) {
    setPagamentos((prev) => {
      const linhas = prev.map((l, i) => (i === index ? { ...l, ...mudanca } : l))
      // Mexeu numa parte que não é a última: a última recebe o que falta.
      if (linhas.length > 1 && index !== linhas.length - 1 && mudanca.valor !== undefined) {
        const ultima = linhas.length - 1
        linhas[ultima] = { ...linhas[ultima], valor: restante(linhas, total, ultima).toFixed(2) }
      }
      return linhas
    })
  }

  function dividirPagamento() {
    setPagamentos((prev) => {
      const linhas = prev.map((l) => ({ ...l, valor: l.valor || total.toFixed(2) }))
      const proximaForma = linhas.some((l) => l.forma === 'dinheiro') ? 'pix' : 'dinheiro'
      return [...linhas, { forma: proximaForma, valor: '0.00' }]
    })
  }

  function removerPagamento(index: number) {
    setPagamentos((prev) => {
      const linhas = prev.filter((_, i) => i !== index)
      if (linhas.length === 1) return [{ ...linhas[0], valor: '' }]
      const ultima = linhas.length - 1
      linhas[ultima] = { ...linhas[ultima], valor: restante(linhas, total, ultima).toFixed(2) }
      return linhas
    })
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
        chave: gerarId(),
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
        chave: gerarId(),
        tipo: 'servico',
        refId: servico.service_id,
        nome: `${servico.servico} (pacote)`,
        quantidade: 1,
        preco_unitario: 0,
        viaPacoteNovo: uidPacote,
      },
    ])
  }

  /**
   * "Sim, é esse": vincula a venda ao horário escolhido na pergunta.
   *
   * A comissão é de quem atendeu, então a venda passa para o barbeiro do
   * horário (quando ele está na lista — o barbeiro logado só vê a si mesmo, e
   * a RLS só mostrou os horários dele). E a comanda vazia ganha os serviços
   * do horário, como no "Concluir e cobrar": as duas portas precisam dar no
   * mesmo lugar.
   */
  function vincular(h: HorarioDoDia) {
    setVinculo({ id: h.id, hora: horaLocal(h.inicio), origem: 'sugestao' })
    setSemVinculo(false)
    setError(null)
    if (professionals.some((p) => p.id === h.professionalId)) setProfessionalId(h.professionalId)
    if (items.length === 0) preencherServicosDoHorario(h.id)
  }

  async function preencherServicosDoHorario(appointmentId: string) {
    const { data } = await supabase
      .from('servicos_do_agendamento')
      .select('service_id')
      .eq('appointment_id', appointmentId)
      .order('ordem')
    const novos: SaleItemDraft[] = ((data ?? []) as { service_id: string }[])
      .map((l) => services.find((s) => s.id === l.service_id))
      .filter((s): s is Option => Boolean(s))
      .map((s) => ({
        chave: gerarId(),
        tipo: 'servico',
        refId: s.id,
        nome: s.nome,
        quantidade: 1,
        preco_unitario: s.preco,
      }))
    // Só entra se a comanda continuar vazia: se o barbeiro lançou algo
    // enquanto a consulta voltava, o que ele lançou vale.
    if (novos.length > 0) setItems((prev) => (prev.length === 0 ? novos : prev))
  }

  /**
   * Desfaz o vínculo e já registra a resposta "sem horário" — é a saída quando
   * o horário não pode virar concluído (cadeira ocupada, horário excluído).
   * "Mudar" traz a pergunta de volta.
   */
  function desvincular() {
    setVinculo(null)
    setSemVinculo(true)
    setError(null)
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
    // Pacote sem cliente não existe: o crédito precisa de um dono.
    if (!clientId && items.some((i) => i.tipo === 'pacote' || i.viaPacote || i.viaPacoteNovo)) {
      setError('Escolha o cliente antes de vender ou usar pacote.')
      return
    }
    // Cinto e suspensório: se algum item ainda aponta para saldo que não é
    // deste cliente (troca no meio, saldo ainda carregando), barra a venda.
    const saldosDoCliente = new Set(saldos.map((s) => s.pacote_do_cliente_id))
    if (items.some((i) => i.viaPacote && !saldosDoCliente.has(i.viaPacote))) {
      setError('O saldo de pacote usado não é do cliente escolhido. Remova o item e use o pacote de novo.')
      return
    }
    const semPreco = items.find((i) => !itemComPrecoValido(i))
    if (semPreco) {
      setError(`"${semPreco.nome}" está sem preço. Informe um valor maior que zero.`)
      return
    }
    const resultadoPagamentos = pagamentosDaComanda(pagamentos, total)
    if (!resultadoPagamentos.ok) {
      setError(resultadoPagamentos.erro)
      return
    }
    if (faltaResponder({ vinculado: Boolean(vinculo), semVinculo, horarios: horariosDoDia.length })) {
      setError('Responda acima se esta venda é do horário de hoje do cliente.')
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
        appointment_id: vinculo?.id ?? null,
        status: 'fechada',
        closed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('Erro ao criar venda:', orderError)
      // Horário vinculado que sumiu no meio do caminho (excluído em outro
      // aparelho) derruba a comanda pela chave estrangeira — e aí "tente
      // novamente" falharia para sempre.
      setError(
        vinculo && orderError?.code === '23503'
          ? mensagemDeFalhaNoVinculo(orderError, vinculo.hora)
          : 'Não foi possível registrar a venda. Tente novamente.',
      )
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

      // 3. Pagamento — uma linha por parte (Pix 30 + dinheiro 20 são duas).
      const { error: paymentError } = await supabase
        .from('payments')
        .insert(resultadoPagamentos.pagamentos.map((p) => ({ order_id: order.id, ...p })))
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

      // 8. Venda de um horário: o horário vira concluído. Fatal de propósito —
      // venda sem horário concluído deixaria o cron registrar como "não veio"
      // quem veio e pagou (e, na reativação, contar falta contra o cliente).
      //
      // `faltou` também passa por aqui: é a correção de quem lançou tarde. Se
      // a cadeira já foi ocupada por outro atendimento, as travas de
      // sobreposição recusam (23P01), porque o horário voltaria a ocupá-la.
      //
      // O `.select` enxerga o update que não pegou linha nenhuma (horário
      // excluído, ou fora do alcance da RLS): sem ele, "0 linhas" passaria
      // como sucesso, e o horário ficaria como "não veio" em silêncio.
      if (vinculo) {
        const { data: concluidos, error: apptError } = await supabase
          .from('appointments')
          .update({ status: 'concluido' })
          .eq('id', vinculo.id)
          .select('id')
        if (apptError || !concluidos?.length) {
          throw new FalhaAoConcluirHorario(apptError ?? { code: SEM_LINHA })
        }
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
      // Falha do vínculo não se resolve tentando de novo: a mensagem diz o
      // que fazer (desvincular) em vez do "tente novamente" de sempre.
      setError(
        err instanceof FalhaAoConcluirHorario
          ? mensagemDeFalhaNoVinculo(err.falha, vinculo?.hora ?? null)
          : 'Não foi possível completar a venda. Nada foi salvo, tente novamente.',
      )
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
    <Modal
      onClose={onClose}
      titulo="Nova venda"
      tamanho="lg"
      bloquearFechamento={saving}
      confirmarFechamento={items.length > 0 ? 'Descartar esta comanda? Os itens lançados se perdem.' : false}
    >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rotulo="Cliente (opcional)" htmlFor="venda-cliente">
              <Select
                id="venda-cliente"
                value={clientId}
                onChange={(e) => {
                  // Trocar de cliente derruba os itens que usavam saldo de
                  // pacote do cliente anterior — senão a comanda do novo
                  // cliente debita o crédito do antigo em silêncio.
                  setClientId(e.target.value)
                  setItems((prev) => prev.filter((i) => !i.viaPacote))
                  // Pelo mesmo motivo, o vínculo SUGERIDO cai: era com um
                  // horário do cliente anterior. O que veio da agenda fica —
                  // foi escolhido no cartão do próprio horário, e trocar o
                  // cliente ali costuma ser corrigir o nome. A resposta "sem
                  // horário" também zera: a pergunta agora é sobre outra pessoa.
                  if (vinculo?.origem === 'sugestao') setVinculo(null)
                  setSemVinculo(false)
                }}
              >
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>

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

            <Campo rotulo="Profissional" htmlFor="venda-profissional">
              <Select
                id="venda-profissional"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>

          {/* De qual horário é esta venda (plano C). Fica entre o cabeçalho e
              os itens porque "Sim" preenche a comanda com os serviços do
              horário — é a próxima coisa que o barbeiro vai olhar. */}
          {vinculo ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success-soft p-2.5 text-sm">
              <span className="flex items-center gap-2 min-w-0 text-foreground">
                <CalendarCheck size={16} className="shrink-0 text-success" />
                <span className="min-w-0">
                  Venda do horário {vinculo.hora ? `das ${vinculo.hora}` : 'da agenda'} — ao finalizar,
                  ele passa para concluído.
                </span>
              </span>
              <button type="button" onClick={desvincular} className="shrink-0 btn-chip">
                Desvincular
              </button>
            </div>
          ) : semVinculo ? (
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Venda sem horário vinculado.</span>
              {horariosDoDia.length > 0 && (
                <button type="button" onClick={() => setSemVinculo(false)} className="shrink-0 btn-chip">
                  Mudar
                </button>
              )}
            </div>
          ) : horariosDoDia.length > 0 ? (
            <div className="rounded-lg border border-primary/40 bg-primary-soft/30 p-3 space-y-2 text-sm">
              <p className="text-foreground">
                {perguntaDoVinculo(clients.find((c) => c.id === clientId)?.nome ?? 'O cliente', horariosDoDia)}
              </p>
              <p className="text-xs text-muted-foreground">
                Se for, o horário passa para concluído. Horário sem venda fica como “não veio” 15
                minutos depois do fim.
              </p>
              <div className="flex flex-wrap gap-2">
                {horariosDoDia.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => vincular(h)}
                    className="btn-chip btn-chip-primario"
                  >
                    {horariosDoDia.length === 1 ? 'Sim, é esse' : rotuloDoHorario(h)}
                  </button>
                ))}
                <button type="button" onClick={() => setSemVinculo(true)} className="btn-chip">
                  Não, é outra venda
                </button>
              </div>
            </div>
          ) : null}

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

              <Select
                value={itemRef}
                onChange={(e) => setItemRef(e.target.value)}
                className="flex-1 min-w-36"
              >
                <option value="">Selecione...</option>
                {currentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome} — {formatCurrency(o.preco)}
                    {itemType === 'produto' ? ` (${(o as ProductOption).estoque_atual} em estoque)` : ''}
                  </option>
                ))}
              </Select>

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
                  key={i.chave}
                  className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-foreground truncate">
                    {i.quantidade}× {i.nome}
                    <span className="text-muted-foreground"> · {i.tipo === 'servico' ? 'Serviço' : i.tipo === 'pacote' ? 'Pacote' : 'Produto'}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {i.viaPacote || i.viaPacoteNovo ? (
                      <span className="font-medium text-foreground">{formatCurrency(0)}</span>
                    ) : (
                      <>
                        {/* Não controlado de propósito: controlado por número,
                            "12," virava 12 antes de dar tempo de digitar o
                            resto.

                            E é por isso que a `key` da linha PRECISA ser o id
                            estável do item (`chave`), nunca o índice. O
                            comentário que morava aqui dizia o contrário — "a
                            chave é o índice, então remover um item remonta os
                            de baixo com o preço certo" — e é justamente a chave
                            por índice que IMPEDE a remontagem: tirando o item 0
                            de [A 10, B 20], o React reaproveita o input da
                            posição 0 para o B, e input não controlado ignora
                            `defaultValue` depois de montado. A caixa seguia
                            mostrando 10 enquanto o nome e o total ao lado já
                            diziam B e R$ 20,00 — na tela que fecha dinheiro
                            (achado M6 do giro de 10/09). */}
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="0.01"
                          defaultValue={i.preco_unitario}
                          onChange={(e) => alterarPreco(idx, e.target.value)}
                          aria-label={`Preço unitário de ${i.nome}`}
                          className="w-24 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-1 text-sm text-right"
                        />
                        <span className="font-medium text-foreground w-20 text-right">
                          {formatCurrency(i.quantidade * i.preco_unitario)}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => removeItem(idx)}
                      aria-label={`Remover ${i.nome}`}
                      className="text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <span className="block text-sm text-muted-foreground">Forma de pagamento</span>
              {pagamentos.map((linha, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    aria-label={`Forma de pagamento ${idx + 1}`}
                    value={linha.forma}
                    onChange={(e) => alterarPagamento(idx, { forma: e.target.value })}
                    className="flex-1"
                  >
                    {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  {pagamentos.length > 1 && (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="0.01"
                        value={linha.valor}
                        onChange={(e) => alterarPagamento(idx, { valor: e.target.value })}
                        aria-label={`Valor em ${PAYMENT_LABELS[linha.forma] ?? linha.forma}`}
                        placeholder="0,00"
                        className="w-28 border border-border-strong bg-surface text-foreground rounded-lg px-2 py-2 text-sm text-right"
                      />
                      <button
                        type="button"
                        onClick={() => removerPagamento(idx)}
                        aria-label="Remover esta parte do pagamento"
                        className="text-danger p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button type="button" onClick={dividirPagamento} className="btn-chip">
                <Plus size={12} />
                Dividir pagamento
              </button>
              {(() => {
                const diferenca = faltaOuSobra(pagamentos, total)
                if (diferenca === null || Math.abs(diferenca) < 0.005) return null
                return (
                  <p className="text-xs text-warning">
                    {diferenca > 0
                      ? `Falta ${formatCurrency(diferenca)} para fechar o total.`
                      : `Sobra ${formatCurrency(-diferenca)} em relação ao total.`}
                  </p>
                )
              })()}
            </div>

            <div className="text-right">
              <span className="text-xs text-muted-foreground">Total</span>
              <div className="text-2xl font-semibold text-foreground">{formatCurrency(total)}</div>
            </div>
          </div>

          <ErroInline>{error}</ErroInline>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              type="button"
              className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            {/* Espera a lista de horários do cliente: finalizar antes de ela
                chegar pularia a pergunta e deixaria o horário como "não veio". */}
            <button
              onClick={handleSave}
              disabled={saving || conferindoHorarios || items.length === 0}
              type="button"
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Salvando...' : conferindoHorarios ? 'Conferindo horários...' : 'Finalizar venda'}
            </button>
          </div>
        </div>
    </Modal>
  )
}
