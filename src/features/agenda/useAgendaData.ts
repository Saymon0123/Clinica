import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Appointment, Professional, Service } from './types'

function dayBounds(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Janela de trabalho do profissional no dia exibido, em minutos desde 00:00. */
export type Jornada = { inicioMin: number; fimMin: number }

function minutosDe(hora: string) {
  const [h, m] = String(hora).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

/**
 * Espera antes de recarregar depois de uma mudança chegar pelo Realtime.
 *
 * O cron `cancela_agendamentos_sem_comanda` roda a cada 5 minutos e pode virar
 * vários agendamentos de uma vez; sem esta espera, cada linha disparava uma
 * recarga inteira da agenda (quatro consultas) em rajada.
 */
const ESPERA_REALTIME_MS = 600

export function useAgendaData(salonId: string | null, date: Date) {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  // null = folga naquele dia; ausente do mapa = jornada nunca configurada
  // (aí a grade fica neutra, sem sombrear nada — sombrear tudo assustaria
  // exatamente quem acabou de criar a conta).
  const [jornadas, setJornadas] = useState<Record<string, Jornada | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cada carga ganha um número; só a mais recente pode escrever na tela.
  //
  // Sem isto, uma resposta atrasada sobrescrevia a mais nova: clicar rápido
  // entre dois dias, ou uma recarga do Realtime ainda em voo quando o dono
  // troca de data, fazia a grade mostrar os horários do dia ANTERIOR sob o
  // título do dia novo. O Realtime multiplicou as cargas concorrentes, então a
  // trava veio junto.
  const pedidoRef = useRef(0)

  /**
   * `silencioso` é a recarga que vem de fora — Realtime, volta ao app — e não
   * pode piscar a tela: sem esqueleto, sem apagar o erro antes da hora, e sem
   * esvaziar a grade se falhar. O que está na tela continua valendo, com o
   * banner de erro por cima avisando que pode estar desatualizado.
   */
  const carregar = useCallback(
    async (silencioso: boolean) => {
      if (!salonId) return
      const meuPedido = ++pedidoRef.current
      if (!silencioso) {
        setLoading(true)
        setError(null)
      }

      const { start, end } = dayBounds(date)

      const [profResult, servResult, apptResult, jornadaResult] = await Promise.all([
        // Todos, não só os ativos: o inativo com horário marcado no dia continua
        // com coluna (achado 42) — filtrado logo abaixo, com os agendamentos na mão.
        supabase.from('professionals').select('id, nome, ativo').eq('salon_id', salonId).order('nome'),
        supabase.from('services').select('id, nome, duracao_minutos, preco').eq('salon_id', salonId).eq('ativo', true).order('nome'),
        supabase
          .from('appointments')
          .select(
            // `services!appointments_service_id_fkey` é OBRIGATÓRIO desde a 0120:
            // appointment_services criou um segundo caminho appointments↔services
            // (many-to-many) e o embed sem hint vira PGRST201 (ambíguo) — foi o
            // que derrubou a agenda inteira em 31/08. Vale para TODO embed de
            // services a partir de appointments. O count fica no cliente
            // (appointment_services.length) para não depender de agregado.
            'id, professional_id, client_id, service_id, data_hora_inicio, data_hora_fim, status, chegou_em, iniciado_em, clients(nome), services!appointments_service_id_fkey(nome), appointment_services(service_id)',
          )
          .eq('salon_id', salonId)
          .gte('data_hora_inicio', start)
          .lte('data_hora_inicio', end)
          // Cancelado FICA na grade, cinza e riscado — decisão de 2026-08-24: o
          // barbeiro precisa ver que o horário caiu (e por quê aquele buraco
          // existe), e é do bloco cancelado que sai o botão de excluir de vez.
          // As travas de sobreposição e o horarios_livres já ignoram cancelados,
          // então o horário continua livre de verdade para remarcar por cima.
          .order('data_hora_inicio'),
        // Jornada do dia exibido, só para SOMBREAR a grade (fora da jornada =
        // cinza). Não trava clique nenhum: encaixe fora do expediente continua
        // possível, como sempre foi — quem valida é o fluxo de criação.
        supabase
          .from('professional_schedules')
          .select('professional_id, hora_inicio, hora_fim, ativo')
          .eq('dia_semana', date.getDay()),
      ])

      // Uma carga mais nova já foi pedida: esta resposta é velha e não escreve.
      if (meuPedido !== pedidoRef.current) return

      if (profResult.error || servResult.error || apptResult.error) {
        console.error(profResult.error || servResult.error || apptResult.error)
        setError('Não foi possível carregar a agenda.')
        setLoading(false)
        return
      }

      // Falha aqui não derruba a agenda: sem jornada, a grade só fica sem sombra.
      const mapaJornadas: Record<string, Jornada | null> = {}
      for (const j of jornadaResult.data ?? []) {
        mapaJornadas[j.professional_id] = j.ativo
          ? { inicioMin: minutosDe(j.hora_inicio), fimMin: minutosDe(j.hora_fim) }
          : null
      }
      setJornadas(mapaJornadas)

      // Desativar um barbeiro sumia com os agendamentos dele da tela (achado 42
      // da revisão de 01/09): a agenda só carregava ativos, e os horários
      // continuavam no banco sem coluna onde aparecer. Agora o inativo fica na
      // grade enquanto tiver horário vivo no dia exibido — com selo, e sem
      // receber reserva nova (os modais recebem só os ativos). Ativos primeiro.
      const comHorarioNoDia = new Set(
        ((apptResult.data ?? []) as { professional_id: string | null; status: string }[])
          .filter((a) => a.status !== 'cancelado' && a.professional_id)
          .map((a) => a.professional_id as string),
      )
      const todos = (profResult.data ?? []) as Professional[]
      setProfessionals([
        ...todos.filter((p) => p.ativo),
        ...todos.filter((p) => !p.ativo && comHorarioNoDia.has(p.id)),
      ])
      setServices(servResult.data ?? [])
      setAppointments(
        (apptResult.data ?? []).map((row) => {
          const r = row as unknown as Appointment & {
            clients: { nome: string } | null
            services: { nome: string } | null
            appointment_services: { service_id: string }[] | null
          }
          // Conta no cliente: com 1 (ou 0, agendamento antigo sem linha na
          // tabela nova) não mostra sufixo; com 2+ mostra quantos A MAIS.
          const totalServicos = r.appointment_services?.length ?? 0
          return {
            id: r.id,
            professional_id: r.professional_id,
            client_id: r.client_id,
            service_id: r.service_id,
            data_hora_inicio: r.data_hora_inicio,
            data_hora_fim: r.data_hora_fim,
            status: r.status,
            chegou_em: r.chegou_em ?? null,
            iniciado_em: r.iniciado_em ?? null,
            client_nome: r.clients?.nome ?? null,
            service_nome: r.services?.nome ?? null,
            servicos_extras: totalServicos > 1 ? totalServicos - 1 : 0,
          }
        }),
      )
      // Recarga silenciosa que dá certo limpa um erro que tinha ficado de antes.
      setError(null)
      setLoading(false)
    },
    [salonId, date],
  )

  const reload = useCallback(() => carregar(false), [carregar])

  useEffect(() => {
    reload()
  }, [reload])

  // A assinatura abaixo vive enquanto o salão não muda, e precisa sempre
  // recarregar o dia que está NA TELA agora — não o do momento em que assinou.
  const carregarRef = useRef(carregar)
  useEffect(() => {
    carregarRef.current = carregar
  }, [carregar])

  /**
   * A grade se atualiza sozinha (achado A5 do giro de 10/09).
   *
   * O único canal que existia era o do aviso de reserva nova, no `AppLayout`: só
   * `INSERT`, e sem falar com esta tela. Resultado, nos dois sentidos:
   *
   * - o cliente cancelava às 9h o horário das 14h e NADA mudava — nenhum som, a
   *   grade intacta, e o barbeiro recusava um cliente sem hora para segurar uma
   *   cadeira que já estava vazia;
   * - o cliente marcava pelo QR, o aviso tocava e sumia em 15s — e a grade
   *   também não mudava. O barbeiro via 14h livre, encaixava alguém e levava
   *   "já existe um agendamento nesse horário" num horário que a tela dele
   *   mostrava vazio.
   *
   * Recarrega tudo em vez de aplicar a linha que chegou porque a tabela está
   * com REPLICA IDENTITY padrão: o `UPDATE` só traz a chave primária no `old`.
   * Sem o dia antigo não dá para saber se um horário foi remarcado PARA FORA do
   * dia exibido — filtrar por dia perderia exatamente esse caso.
   *
   * E duas redes para o que o Realtime não pega: ao reconectar (o celular
   * trocou de antena, o WebSocket caiu e os eventos do intervalo se perderam) e
   * ao voltar para o app (o dono saiu para o WhatsApp e voltou), recarrega uma vez.
   */
  useEffect(() => {
    if (!salonId) return
    let timer: number | undefined
    let jaConectou = false

    const agendar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void carregarRef.current(true), ESPERA_REALTIME_MS)
    }

    const channel = supabase
      .channel(`agenda_${salonId}`)
      // INSERT e UPDATE — sem DELETE, de propósito. Com REPLICA IDENTITY padrão
      // o `old` de um DELETE só traz a chave primária, então não há `salon_id`
      // para o filtro casar. E exclusão de agendamento só nasce nesta tela: o
      // "excluir de vez" do bloco já cancelado (`AppointmentDetailModal`) e o
      // rollback de um cadastro que falhou no meio (`NewAppointmentModal`,
      // quando os serviços extras não cabem) — os dois já recarregam por conta
      // própria. Nenhuma função do banco apaga agendamento; os crons fazem
      // UPDATE (conferido em 11/09).
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        agendar,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
        agendar,
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // A primeira conexão não recarrega: a carga inicial já está em voo.
          if (jaConectou) agendar()
          jaConectou = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime da agenda caiu:', status)
        }
      })

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') agendar()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      supabase.removeChannel(channel)
    }
  }, [salonId])

  return { professionals, services, appointments, jornadas, loading, error, reload }
}
