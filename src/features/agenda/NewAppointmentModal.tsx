import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Campo, Input, Select } from '../../components/Campo'
import { Badge } from '../../components/Badge'
import { supabase } from '../../lib/supabase'
import { traduzirErroDoBanco } from '../../lib/erroDoBanco'
import { classificarTelefone, AVISO_TELEFONE_INVALIDO } from '../../lib/telefone'
import type { Professional, Service } from './types'
import { ErroInline } from '../../components/ErroInline'
import {
  DIA_INTEIRO,
  MOTIVO_MAX,
  erroDaJanela,
  fimDeslocado,
  horaDe,
  minutosDe,
} from './janelaDeBloqueio'

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

  // BLOQUEAR HORÁRIO (0182). O status `bloqueio` existia no banco e no CRM
  // desde sempre, mas nada o criava -- o barbeiro marcava o almoço como
  // reserva no nome de um cliente inventado. Mora nesta mesma tela porque três
  // dos quatro campos já estavam aqui: dia, cadeira e hora.
  const [modo, setModo] = useState<'reserva' | 'bloqueio'>('reserva')
  const [horaFim, setHoraFim] = useState(() => horaDe(minutosDe(defaultTime ?? '09:00') + 60))
  const [motivo, setMotivo] = useState('')
  const [diaInteiro, setDiaInteiro] = useState(false)

  // Com "dia inteiro" marcado os campos ficam desabilitados mostrando
  // 00:00–23:59, e `time`/`horaFim` seguem intocados embaixo: desmarcar
  // devolve a janela que ele tinha escolhido, em vez de um horário inventado.
  const janela = diaInteiro ? DIA_INTEIRO : { inicio: time, fim: horaFim }

  function mudarInicio(novo: string) {
    // O fim anda junto, preservando a duração -- quem já ajustou "até as 14h"
    // não quer o fim recalculado do zero ao adiantar o começo em dez minutos.
    setHoraFim((fim) => fimDeslocado(time, novo, fim))
    setTime(novo)
  }

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

  // Mesmo cálculo do submit: fim do atendimento antes de agora.
  const horarioJaPassou =
    selectedServices.length > 0 &&
    toDateTimeLocal(date, time).getTime() + duracaoTotal * 60000 < Date.now()

  function formatDuracao(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h${String(m).padStart(2, '0')}`
  }

  /**
   * O bloqueio é uma linha sem cliente e sem serviço — e por isso não passa por
   * nada do fluxo de reserva: não procura cliente, não cria cliente, não tem o
   * que desfazer se falhar.
   *
   * Quem recusa sobreposição é a trava do banco (`appointments_sem_sobreposicao`),
   * a mesma que já vale para o link público e para o agente do WhatsApp. Não há
   * régua repetida aqui.
   */
  async function salvarBloqueio() {
    if (!professionalId) {
      setError('Selecione o profissional.')
      return
    }
    const problema = erroDaJanela(janela.inicio, janela.fim)
    if (problema) {
      setError(problema)
      return
    }

    setSubmitting(true)
    try {
      const inicio = toDateTimeLocal(date, janela.inicio)
      const fim = toDateTimeLocal(date, janela.fim)
      const { error: bloqueioError } = await supabase.from('appointments').insert({
        salon_id: salonId,
        professional_id: professionalId,
        data_hora_inicio: inicio.toISOString(),
        data_hora_fim: fim.toISOString(),
        status: 'bloqueio',
        // Motivo em branco não vira string vazia: a coluna é nula por natureza
        // e a Agenda cai no rótulo "Bloqueio" sozinha.
        motivo_do_bloqueio: motivo.trim() || null,
      })
      if (bloqueioError) throw bloqueioError
      onCreated()
      onClose()
    } catch (err) {
      console.error('Erro ao bloquear horário:', err)
      setError(
        traduzirErroDoBanco(
          err as { code?: string; message?: string } | null,
          {
            '23P01':
              'Esse intervalo já tem horário marcado para este profissional. Cancele ou remarque antes de bloquear.',
          },
          'Não foi possível bloquear o horário. Tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (modo === 'bloqueio') {
      await salvarBloqueio()
      return
    }

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
    // O telefone é conferido aqui, junto com as outras validações, e não lá na
    // hora de gravar: a CHECK do banco (0128) devolve 23514 com mensagem em
    // inglês, e ver isso no meio de um agendamento não diz ao barbeiro o que
    // corrigir. A régua é a mesma do banco, vinda de lib/telefone.
    const estadoDoTelefone = classificarTelefone(clientPhone)
    if (estadoDoTelefone === 'invalido') {
      setError(AVISO_TELEFONE_INVALIDO)
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
      //
      // O caminho era escolhido contando dígitos — 10 ou mais ia para a RPC,
      // menos de 8 buscava por nome — e sobrava um vão no meio: 8, 9 ou 14+
      // dígitos não entravam em nenhum dos dois e escorregavam para o insert
      // cru, que hoje bate na CHECK do banco. Os três estados de
      // `classificarTelefone` fecham o vão porque cobrem toda entrada
      // possível, sem faixa órfã: 'invalido' já parou lá em cima, então aqui
      // só resta 'valido' (RPC) ou 'vazio' (nome).
      let existingClient: { id: string } | null = null

      // Com telefone completo, quem resolve é a RPC `garantir_cliente`: ela
      // acha (ou cria) o cliente POR CIMA da RLS de leitura. Antes, um cliente
      // cadastrado por outro barbeiro era invisível na busca e o cadastro
      // batia no índice único — o barbeiro ficava travado sem saída pela tela
      // (achado 11 da revisão de 01/09).
      if (estadoDoTelefone === 'valido') {
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

      if (!existingClient && estadoDoTelefone === 'vazio') {
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
        // Só se chega aqui com o telefone vazio: com telefone válido quem cria
        // é a RPC acima. Por isso o insert nunca leva número — e nunca mais
        // esbarra na CHECK.
        const { data: newClient, error: createError } = await supabase
          .from('clients')
          .insert({ salon_id: salonId, nome: clientName.trim(), telefone: null })
          .select('id')
          .single()
        if (createError) throw createError
        clientId = newClient.id
        clienteCriadoAgora = newClient.id
      }

      const servicoPrincipal = selectedServices[0]
      const start = toDateTimeLocal(date, time)
      const end = new Date(start.getTime() + servicoPrincipal.duracao_minutos * 60000)

      // Horário que já terminou é LANÇAMENTO RETROATIVO, não reserva: o
      // barbeiro atendeu às 14h e está registrando às 15h para não perder o
      // histórico. Como 'agendado', o cron cancelava em minutos e o registro
      // sumia sem explicação (achado 6). Como 'concluido', o cron ignora e a
      // comanda pode ser feita em seguida.
      const jaPassou = end.getTime() < Date.now()

      const { data: novoAgendamento, error: apptError } = await supabase
        .from('appointments')
        .insert({
          salon_id: salonId,
          client_id: clientId,
          professional_id: professionalId,
          service_id: servicoPrincipal.id,
          data_hora_inicio: start.toISOString(),
          data_hora_fim: end.toISOString(),
          status: jaPassou ? 'concluido' : 'agendado',
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
    <Modal
      onClose={onClose}
      titulo={modo === 'bloqueio' ? 'Bloquear horário' : 'Nova reserva'}
      tamanho="md"
      bloquearFechamento={submitting}
      confirmarFechamento={
        modo === 'bloqueio'
          ? motivo.trim() !== ''
          : clientName.trim() !== '' || clientPhone.trim() !== '' || selectedServices.length > 0
      }
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mesmo padrão de abas do Catálogo: pílula com borda, ativa em
              `btn-primary`. Reservar é o que ele faz o dia todo e fica em
              primeiro; bloquear é ocasional e não merecia botão próprio na
              Agenda, que já tem seis. */}
          <div className="flex rounded-lg border border-border-strong overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setModo('reserva')}
              className={`flex-1 px-4 py-2 font-medium ${modo === 'reserva' ? 'btn-primary' : 'bg-surface text-foreground hover:bg-surface-2'}`}
            >
              Reserva
            </button>
            <button
              type="button"
              onClick={() => setModo('bloqueio')}
              className={`flex-1 px-4 py-2 font-medium border-l border-border-strong ${modo === 'bloqueio' ? 'btn-primary' : 'bg-surface text-foreground hover:bg-surface-2'}`}
            >
              Bloquear horário
            </button>
          </div>

          {modo === 'reserva' && (
          <Campo rotulo="Cliente" htmlFor="clientName">
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              placeholder="Nome do cliente"
            />
          </Campo>
          )}

          {modo === 'reserva' && (
          <Campo rotulo="Telefone (opcional)" htmlFor="clientPhone">
            <Input
              id="clientPhone"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </Campo>
          )}

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
          {modo === 'reserva' && (
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
          )}

          {/* Lista dos serviços escolhidos, na ordem em que entraram. O
              primeiro é o principal (vira `service_id`). */}
          {modo === 'reserva' && selectedServices.length > 0 && (
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
                    className="text-danger shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {modo === 'reserva' ? (
            <Campo rotulo="Horário" htmlFor="time">
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </Campo>
          ) : (
            <>
              {/* A reserva tem UM horário (o fim vem da soma dos serviços); o
                  bloqueio tem dois, porque nada calcula a duração de um almoço. */}
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Início" htmlFor="time">
                  <Input
                    id="time"
                    type="time"
                    value={janela.inicio}
                    onChange={(e) => mudarInicio(e.target.value)}
                    disabled={diaInteiro}
                    required
                  />
                </Campo>
                <Campo rotulo="Fim" htmlFor="horaFim">
                  <Input
                    id="horaFim"
                    type="time"
                    value={janela.fim}
                    onChange={(e) => setHoraFim(e.target.value)}
                    disabled={diaInteiro}
                    required
                  />
                </Campo>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={diaInteiro}
                  onChange={(e) => setDiaInteiro(e.target.checked)}
                  className="accent-primary"
                />
                Dia inteiro
              </label>

              <Campo
                rotulo="Motivo (opcional)"
                htmlFor="motivo"
                apoio="Só a barbearia vê. O cliente não recebe explicação — o horário apenas não aparece para ele."
              >
                <Input
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={MOTIVO_MAX}
                  placeholder="Almoço, médico, folga..."
                />
              </Campo>

              <p className="text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-2">
                O horário sai da agenda pública e o atendente do WhatsApp deixa de
                oferecê-lo. Quem já tem reserva nesse intervalo <strong>não</strong> é
                avisado — cancele ou remarque antes.
              </p>
            </>
          )}

          {/* O barbeiro precisa saber ANTES de salvar que este lançamento é
              retroativo — senão ele procura a reserva na agenda de hoje e não
              encontra, porque ela nasceu concluída. */}
          {horarioJaPassou && (
            <p className="text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-2">
              Esse horário já passou. Vamos registrar como{' '}
              <strong>atendimento concluído</strong> — depois é só fechar a comanda no Financeiro.
            </p>
          )}

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
              disabled={
                submitting ||
                professionals.length === 0 ||
                // Serviço só é exigido na reserva: uma barbearia recém-criada,
                // com o catálogo ainda vazio, continua podendo fechar a agenda.
                (modo === 'reserva' && (services.length === 0 || selectedServices.length === 0))
              }
              className="flex-1 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting
                ? 'Salvando...'
                : modo === 'bloqueio'
                  ? 'Bloquear horário'
                  : 'Salvar reserva'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
