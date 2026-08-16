import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Agenda pública — o QR do balcão.
 *
 * O cliente chega sem hora marcada, o barbeiro está cortando. Em vez de o
 * barbeiro parar para atendê-lo, o cliente escaneia o QR, vê o que está livre e
 * marca sozinho.
 *
 * **Roda sem usuário nenhum** (`verify_jwt: false`). Por isso toda a
 * autorização é explícita aqui dentro, e a superfície é mínima: dá para ver
 * horários livres e criar **um** agendamento para hoje. Nada mais.
 *
 * O que ela deliberadamente **não** faz: listar clientes, mostrar de quem é o
 * agendamento que ocupa um horário, cancelar, remarcar, ou agendar para outro
 * dia. Cada uma dessas viraria uma porta aberta na rua.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Teto de agendamentos públicos por barbearia por hora. Não é limite de uso —
 *  uma barbearia real não recebe 10 walk-ins numa hora. É disjuntor contra
 *  alguém que fotografou o QR e resolveu encher a agenda. */
const TETO_POR_HORA = 10

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/** Últimos 8 dígitos, que é como o projeto casa cliente em todo lugar.
 *  Número antigo sem o 9 não bate com o formato novo; os 8 finais batem. */
function normalizar(telefone: string) {
  return telefone.replace(/\D/g, '').slice(-8)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido.' }, 400)
  }

  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Barbearia nao informada.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // A barbearia existe, está ativa, está sendo atendida e tem o recurso ligado?
  //
  // `salons_atendendo` já embute "ativa e em dia" — reusar em vez de repetir a
  // regra é o que impede a página pública de continuar marcando horário numa
  // barbearia que parou de pagar.
  const { data: salao } = await admin
    .from('salons_atendendo')
    .select('id, nome')
    .eq('id', salonId)
    .maybeSingle()

  if (!salao) return json({ error: 'Barbearia nao encontrada.' }, 404)

  const { data: temRecurso } = await admin
    .from('recursos_ativos')
    .select('ativo')
    .eq('salon_id', salonId)
    .eq('recurso', 'agenda_publica')
    .maybeSingle()

  if (!temRecurso?.ativo) {
    return json({ error: 'Esta barbearia nao usa agendamento pelo QR.' }, 403)
  }

  // ------------------------------------------------------------------
  // Consultar: serviços e horários livres de HOJE.
  // ------------------------------------------------------------------
  if (body.acao === 'consultar') {
    const { data: servicos } = await admin
      .from('services')
      .select('id, nome, preco, duracao_minutos')
      .eq('salon_id', salonId)
      .eq('ativo', true)
      .order('preco')

    const servicoId = body.servicoId as string | undefined
    const escolhido = servicos?.find((s) => s.id === servicoId) ?? servicos?.[0]

    if (!escolhido) {
      return json({ salao: salao.nome, servicos: [], horarios: [] })
    }

    // Só HOJE. O QR está no balcão: quem escaneou está lá agora, e abrir a
    // agenda de outros dias transformaria isto na agenda pública inteira, com
    // uma superfície de abuso muito maior.
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    const { data: horarios, error: erroHorarios } = await admin.rpc('horarios_livres', {
      p_salon_id: salonId,
      p_data: hoje,
      p_duracao_minutos: escolhido.duracao_minutos,
    })

    if (erroHorarios) {
      console.error('Erro ao calcular horarios:', erroHorarios)
      return json({ error: 'Nao foi possivel carregar os horarios.' }, 500)
    }

    return json({
      salao: salao.nome,
      servicos: servicos ?? [],
      servicoEscolhido: escolhido.id,
      horarios: horarios ?? [],
    })
  }

  // ------------------------------------------------------------------
  // Agendar.
  // ------------------------------------------------------------------
  if (body.acao !== 'agendar') return json({ error: 'Acao invalida.' }, 400)

  const nome = (body.nome as string | undefined)?.trim()
  const telefone = (body.telefone as string | undefined)?.replace(/\D/g, '') ?? ''
  const servicoId = body.servicoId as string | undefined
  const profissionalId = body.profissionalId as string | undefined
  const inicio = body.inicio as string | undefined

  if (!nome) return json({ error: 'Informe seu nome.' }, 400)
  if (telefone.length < 10) return json({ error: 'Informe um telefone com DDD.' }, 400)
  if (!servicoId || !profissionalId || !inicio) {
    return json({ error: 'Escolha um horario.' }, 400)
  }

  // Disjuntor: alguém fotografou o QR e resolveu encher a agenda.
  const umaHoraAtras = new Date(Date.now() - 3600000).toISOString()
  const { count: recentes } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .eq('origem', 'publico')
    .gte('created_at', umaHoraAtras)

  if ((recentes ?? 0) >= TETO_POR_HORA) {
    console.warn('Teto de agendamentos publicos atingido:', salonId)
    return json({ error: 'Muitos agendamentos agora. Fale com a barbearia.' }, 429)
  }

  const { data: servico } = await admin
    .from('services')
    .select('id, duracao_minutos')
    .eq('id', servicoId)
    .eq('salon_id', salonId)
    .eq('ativo', true)
    .maybeSingle()

  if (!servico) return json({ error: 'Servico indisponivel.' }, 400)

  // O horário pedido é mesmo um dos livres de hoje?
  //
  // Sem esta checagem, a regra "só hoje" existiria apenas na tela: quem
  // chamasse a função direto podia marcar às 3h da manhã, num dia em que a
  // barbearia fecha, ou com um barbeiro que não trabalha. A trava de
  // sobreposição do banco impede colisão, mas não impede horário absurdo.
  //
  // Revalidar contra a mesma função que gerou a lista fecha a porta e, de
  // quebra, resolve o caso de alguém deixar a tela aberta por meia hora: o
  // horário some da lista e a marcação é recusada com explicação.
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data: livres } = await admin.rpc('horarios_livres', {
    p_salon_id: salonId,
    p_data: hoje,
    p_duracao_minutos: servico.duracao_minutos,
    p_professional_id: profissionalId,
  })

  const pedido = new Date(inicio).getTime()
  const valido = (livres ?? []).some(
    (h: { inicio: string }) => new Date(h.inicio).getTime() === pedido,
  )

  if (!valido) {
    return json({ error: 'Esse horario nao esta mais disponivel. Escolha outro.', conflito: true }, 409)
  }

  // Cliente: casa pelo TELEFONE, nunca pelo nome. Casar por nome junta dois
  // homônimos e separa o mesmo cliente que escreveu o nome diferente — e aí a
  // barbearia perde o histórico dele sem perceber.
  const norm = normalizar(telefone)
  const { data: existente } = await admin
    .from('clients')
    .select('id')
    .eq('salon_id', salonId)
    .eq('telefone_norm', norm)
    .maybeSingle()

  let clientId = existente?.id ?? null

  // Um agendamento futuro ativo por pessoa. Impede a mesma pessoa de tomar a
  // agenda inteira, e é a trava que funciona mesmo com nome falso.
  if (clientId) {
    const { count: emAberto } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .neq('status', 'cancelado')
      .neq('status', 'concluido')
      .gte('data_hora_inicio', new Date().toISOString())

    if ((emAberto ?? 0) > 0) {
      return json(
        { error: 'Voce ja tem um horario marcado. Fale com a barbearia para mudar.' },
        409,
      )
    }
  }

  let clienteCriadoAgora = false
  if (!clientId) {
    const { data: novo, error: erroCliente } = await admin
      .from('clients')
      .insert({ salon_id: salonId, nome, telefone })
      .select('id')
      .single()
    if (erroCliente || !novo) {
      console.error('Erro ao criar cliente:', erroCliente)
      return json({ error: 'Nao foi possivel concluir. Tente novamente.' }, 500)
    }
    clientId = novo.id
    clienteCriadoAgora = true
  }

  // `data_hora_fim` sai do trigger `calcula_fim_do_agendamento` (migration
  // 0035): a duração é conta do banco, não de quem chama.
  const { data: agendamento, error: erroAgendamento } = await admin
    .from('appointments')
    .insert({
      salon_id: salonId,
      client_id: clientId,
      professional_id: profissionalId,
      service_id: servicoId,
      data_hora_inicio: inicio,
      status: 'agendado',
      origem: 'publico',
    })
    .select('id, data_hora_inicio')
    .single()

  if (erroAgendamento) {
    // 23P01 é a trava de sobreposição: duas pessoas escanearam o QR ao mesmo
    // tempo e escolheram o mesmo horário. O banco recusou a segunda, que é o
    // certo — o que não pode é a pessoa ver um erro sem entender.
    const conflito = erroAgendamento.code === '23P01'

    // Cliente criado nesta tentativa e agendamento recusado deixaria um
    // cadastro órfão. Mesmo defeito que já aconteceu na tela de agendamento do
    // CRM, e mesma compensação.
    if (clienteCriadoAgora && clientId) {
      await admin.from('clients').delete().eq('id', clientId)
    }

    if (!conflito) console.error('Erro ao agendar:', erroAgendamento)
    return json(
      {
        error: conflito
          ? 'Esse horario acabou de ser pego. Escolha outro.'
          : 'Nao foi possivel agendar. Tente novamente.',
        conflito,
      },
      conflito ? 409 : 500,
    )
  }

  return json({ ok: true, agendamentoId: agendamento.id, inicio: agendamento.data_hora_inicio })
})
