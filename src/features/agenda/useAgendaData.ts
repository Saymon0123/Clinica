import { useCallback, useEffect, useState } from 'react'
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

  const reload = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setError(null)

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
          'id, professional_id, client_id, service_id, data_hora_inicio, data_hora_fim, status, chegou_em, iniciado_em, atraso_perguntado_em, clients(nome), services!appointments_service_id_fkey(nome), appointment_services(service_id)',
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
          atraso_perguntado_em: r.atraso_perguntado_em ?? null,
          client_nome: r.clients?.nome ?? null,
          service_nome: r.services?.nome ?? null,
          servicos_extras: totalServicos > 1 ? totalServicos - 1 : 0,
        }
      }),
    )
    setLoading(false)
  }, [salonId, date])

  useEffect(() => {
    reload()
  }, [reload])

  return { professionals, services, appointments, jornadas, loading, error, reload }
}
