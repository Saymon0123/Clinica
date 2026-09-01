import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Campo, Input, Select } from '../../components/Campo'
import { Badge } from '../../components/Badge'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import type { Professional, Service } from './types'
import { ErroInline } from '../../components/ErroInline'

type Props = {
  salonId: string
  date: Date
  professionals: Professional[]
  services: Service[]
  defaultProfessionalId?: string
  defaultTime?: string
  onClose: () => void
  onCreated: () => void
}

function toDateTimeLocal(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function NewAppointmentModal({
  salonId,
  date,
  professionals,
  services,
  defaultProfessionalId,
  defaultTime,
  onClose,
  onCreated,
}: Props) {
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? '')
  // Serviços da reserva, na ordem em que o barbeiro adicionou (item 6: corte +
  // barba no mesmo horário). Nada vem pré-selecionado nem sugerido — o
  // dono do produto rejeitou chips de "adicionais"; cada serviço entra por
  // escolha explícita, item a item, igual à comanda (NewSaleModal). O
  // primeiro da lista é o serviço PRINCIPAL (vai em `service_id`).
  const [selectedServices, setSelectedServices] = useState<Service[]>([])
  const [serviceToAdd, setServiceToAdd] = useState('')
  const [time, setTime] = useState(defaultTime ?? '09:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Já adicionado não aparece de novo no seletor — evita duplicar o mesmo
  // serviço na lista.
  const servicosDisponiveis = services.filter(
    (s) => !selectedServices.some((sel) => sel.id === s.id),
  )

  function addService() {
    if (!serviceToAdd) return
    const servico = services.find((s) => s.id === serviceToAdd)
    if (!servico) return
    setSelectedServices((prev) => [...prev, servico])
    setServiceToAdd('')
  }

  function removeService(index: number) {
    setSelectedServices((prev) => prev.filter((_, i) => i !== index))
  }

  const duracaoTotal = selectedServices.reduce((acc, s) => acc + s.duracao_minutos, 0)

  function formatDuracao(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h${String(m).padStart(2, '0')}`
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!clientName.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    if (!professionalId) {
      setError('Selecione o profissional.')
      return
    }
    if (selectedServices.length === 0) {
      setError('Adicione ao menos um serviço.')
      return
    }

    setSubmitting(true)
    // Só o cliente criado NESTA tentativa pode ser desfeito. Um cliente que já
    // existia continua existindo, mesmo que a reserva falhe.
    let clienteCriadoAgora: string | null = null
    try {
      let clientId: string

      // A identidade real é o TELEFONE (o banco deduplica pelos últimos 8
      // dígitos): com telefone digitado, o casamento é por ele — dois "João
      // Silva" diferentes deixam de virar a mesma pessoa. Nome é o último
      // recurso, só quando não há telefone.
      const digitos = clientPhone.replace(/\D/g, '')
      let existingClient: { id: string } | null = null

      // Com telefone completo, quem resolve é a RPC `garantir_cliente`: ela
      // acha (ou cria) o cliente POR CIMA da RLS de leitura. Antes, um cliente
      // cadastrado por outro barbeiro era invisível na busca e o cadastro
      // batia no índice único — o barbeiro ficava travado sem saída pela tela
      // (achado 11 da revisão de 01/09).
      if (digitos.length >= 10) {
        const { data, error: rpcError } = await supabase.rpc('garantir_cliente', {
          p_salon_id: salonId,
          p_nome: clientName.trim(),
          p_telefone: clientPhone.trim(),
        })
        if (rpcError) throw rpcError
        const resolvido = (data as { id: string; nome: string; ja_existia: boolean }[] | null)?.[0]
        if (!resolvido) throw new Error('Não foi possível identificar o cliente.')
        existingClient = { id: resolvido.id }
        // Cliente nascido nesta tentativa: se a reserva falhar adiante, ele é
        // desfeito junto (cadastro órfão foi defeito já corrigido antes).
        if (!resolvido.ja_existia) clienteCriadoAgora = resolvido.id
      }

      if (!existingClient && digitos.length < 8) {
        // limit(1) em vez de maybeSingle: dois clientes com o mesmo nome no
        // salão fariam o maybeSingle estourar sem explicação.
        const { data, error: findError } = await supabase
          .from('clients')
          .select('id')
          .eq('salon_id', salonId)
          .ilike('nome', clientName.trim())
          .limit(1)
        if (findError) throw findError
        existingClient = data?.[0] ?? null
      }

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const { data: newClient, error: createError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, nome: clientName.trim(), telefone: clientPhone.trim() || null })
          .select('id')
          .single()
        if (createError) throw createError
        clientId = newClient.id
        clienteCriadoAgora = newClient.id
      }

      const servicoPrincipal = selectedServices[0]
      const start = toDateTimeLocal(date, time)
      const end = new Date(start.getTime() + servicoPrincipal.duracao_minutos * 60000)

      const { data: novoAgendamento, error: apptError } = await supabase
        .from('appointments')
        .insert({
          salon_id: salonId,
          client_id: clientId,
          professional_id: professionalId,
          service_id: servicoPrincipal.id,
          data_hora_inicio: start.toISOString(),
          data_hora_fim: end.toISOString(),
          status: 'agendado',
        })
        .select('id')
        .single()
      if (apptError) throw apptError

      // Corte + barba etc: define a lista completa de serviços do
      // agendamento. A RPC recalcula o fim (soma das durações) e recusa
      // (23P01) se não couber antes do próximo horário do profissional.
      if (selectedServices.length > 1) {
        const { error: servicosError } = await supabase.rpc('definir_servicos_do_agendamento', {
          p_appointment_id: novoAgendamento.id,
          p_service_ids: selectedServices.map((s) => s.id),
        })
        if (servicosError) {
          const { error: rollbackError } = await supabase
            .from('appointments')
            .delete()
            .eq('id', novoAgendamento.id)
          if (rollbackError) {
            console.error('Agendamento com serviços inválidos e não foi possível desfazê-lo:', rollbackError)
          }
          throw servicosError
        }
      }

      clienteCriadoAgora = null
      onCreated()
      onClose()
    } catch (err) {
      // Sem transação entre os dois inserts, a reserva recusada (horário
      // ocupado, por exemplo) deixaria para trás um cliente sem nenhum
      // agendamento. Cada nova tentativa sujaria a aba Clientes.
      if (clienteCriadoAgora) {
        const { error: limpezaError } = await supabase
          .from('clients')
          .delete()
          .eq('id', clienteCriadoAgora)
        if (limpezaError) {
          console.error('Cliente criado sem reserva e não foi possível removê-lo:', limpezaError)
        }
      }
      console.error('Erro ao criar reserva:', err)
      const erro = err as { code?: string; message?: string } | null
      const code = erro?.code
      const mensagem = erro?.message ?? ''
      if (code === '23P01' && selectedServices.length > 1 && mensagem.toLowerCase().includes('sobreposicao')) {
        setError(
          'Os serviços juntos não cabem nesse horário — o seguinte já está ocupado. Escolha outro horário ou menos serviços.',
        )
      } else {
        // Tradutor compartilhado: o mesmo erro do banco passa a dizer a mesma
        // coisa aqui e na aba Clientes.
        setError(
          traduzirErroDoBanco(
            erro,
            { '23P01': 'Já existe um agendamento nesse horário para este profissional. Escolha outro horário.' },
            'Não foi possível criar a reserva. Tente novamente.',
          ),
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose} titulo="Nova reserva" tamanho="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo rotulo="Cliente" htmlFor="clientName">
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              placeholder="Nome do cliente"
            />
          </Campo>

          <Campo rotulo="Telefone (opcional)" htmlFor="clientPhone">
            <Input
              id="clientPhone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </Campo>

          <Campo rotulo="Profissional" htmlFor="professional">
            <Select
              id="professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              required
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </Campo>

          {/* Adição de serviços: mesma mecânica da comanda (NewSaleModal) —
              nada sugerido, o barbeiro escolhe e adiciona um de cada vez. */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Adicionar serviço</span>
            <div className="flex flex-wrap gap-2">
              <Select
                value={serviceToAdd}
                onChange={(e) => setServiceToAdd(e.target.value)}
                className="flex-1 min-w-36"
                aria-label="Serviço a adicionar"
              >
                <option value="">Selecione...</option>
                {servicosDisponiveis.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} · {formatDuracao(s.duracao_minutos)} · R$ {s.preco.toFixed(2)}
                  </option>
                ))}
              </Select>
              <button
                onClick={addService}
                type="button"
                disabled={!serviceToAdd}
                className="flex items-center gap-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Plus size={14} />
                Adicionar
              </button>
            </div>
          </div>

          {/* Lista dos serviços escolhidos, na ordem em que entraram. O
              primeiro é o principal (vira `service_id`). */}
          {selectedServices.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Serviços da reserva</span>
                <span className="text-xs font-medium text-foreground">
                  Total: {formatDuracao(duracaoTotal)}
                </span>
              </div>
              {selectedServices.map((s, idx) => (
                <div
                  key={`${s.id}-${idx}`}
                  className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {idx === 0 && <Badge variante="marca">principal</Badge>}
                    <span className="truncate text-foreground min-w-0 flex-1">
                      {s.nome}
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatDuracao(s.duracao_minutos)} · R$ {s.preco.toFixed(2)}
                      </span>
                    </span>
                  </span>
                  <button
                    onClick={() => removeService(idx)}
                    type="button"
                    aria-label={`Remover ${s.nome}`}
                    className="text-muted-foreground hover:text-danger shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Campo rotulo="Horário" htmlFor="time">
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </Campo>

          <ErroInline>{error}</ErroInline>

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
              disabled={submitting || professionals.length === 0 || services.length === 0 || selectedServices.length === 0}
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar reserva'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
