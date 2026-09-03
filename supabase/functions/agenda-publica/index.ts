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
 * agendamento que ocupa um horário, ou agendar para outro dia. Cada uma dessas
 * viraria uma porta aberta na rua.
 *
 * Cancelar existe, mas NUNCA pela rua: só pelo `token_gestao` — um uuid
 * impossível de adivinhar, gerado por agendamento e entregue apenas a quem
 * marcou (tela de sucesso do QR). Quem tem o token cancela AQUELE horário e
 * nada mais; remarcar é um link para o WhatsApp da barbearia.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Teto de agendamentos públicos por barbearia por hora. Não é limite de uso —
 *  uma barbearia real não recebe 10 walk-ins numa hora. É disjuntor contra
 *  alguém que fotografou o QR e resolveu encher a agenda. */
const TETO_POR_HORA = 10

/**
 * A faixa do telefone: de 10 dígitos (DDD + fixo) a 13 (DDI 55 + DDD + 9).
 *
 * Cópia consciente da CHECK `clients_telefone_valido` / `private.telefone_valido`
 * (migration 0128) e de `src/lib/telefone.ts` — edge function não importa de
 * `src/`, é outro runtime. Mudou num lugar, muda nos três, e a mudança daqui só
 * vale depois de `supabase functions deploy agenda-publica`. Mesmo arranjo do
 * `DIAS_DE_TESTE` em `criar-minha-barbearia`.
 *
 * O teto é o que faltava: com só o piso, quem digitasse 14 dígitos passava
 * daqui, quebrava no insert com 23514 e recebia "Nao foi possivel concluir" e
 * um 500. Do lado de lá é o cliente final, sozinho, de pé no balcão com o
 * celular na mão — ele não tem como adivinhar que o problema é o telefone, e
 * simplesmente desiste do agendamento.
 */
const TELEFONE_MIN_DIGITOS = 10
const TELEFONE_MAX_DIGITOS = 13

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


/** Limite de tentativas via banco (0111). Erro do limitador deixa passar. */
async function taxaExcedida(admin: ReturnType<typeof createClient>, chave: string, limite: number, janelaSegundos: number) {
  const { data, error } = await admin.rpc('taxa_excedida', {
    p_chave: chave,
    p_limite: limite,
    p_janela_segundos: janelaSegundos,
  })
  if (error) {
    console.error('Limitador de taxa indisponivel:', error)
    return false
  }
  return data === true
}

function ipDe(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'sem-ip'
  )
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ------------------------------------------------------------------
  // Gestão pelo token: ver e cancelar O PRÓPRIO horário. Sem salonId de
  // propósito — o token resolve tudo, e não vaza nada de ninguém.
  // ------------------------------------------------------------------
  if (body.acao === 'meu_horario' || body.acao === 'cancelar_horario') {
    const token = (body.token as string | undefined)?.trim() ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return json({ error: 'Link invalido.' }, 400)
    }
    // Freio contra varredura de tokens: uuid aleatório já torna o chute
    // inviável, mas martelar também não fica de graça.
    if (await taxaExcedida(admin, `gestao:${ipDe(req)}`, 12, 600)) {
      return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
    }

    const { data: ag } = await admin
      .from('appointments')
      .select(
        'id, status, data_hora_inicio, services!appointments_service_id_fkey(nome), professionals(nome), salons(nome, telefone)',
      )
      .eq('token_gestao', token)
      .maybeSingle()
    if (!ag) return json({ error: 'Agendamento nao encontrado.' }, 404)

    type Rel = { nome: string | null } | { nome: string | null }[] | null
    const nomeDe = (r: Rel) => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null
    const salaoRel = (Array.isArray(ag.salons) ? ag.salons[0] : ag.salons) as
      | { nome: string | null; telefone: string | null }
      | null
    const whatsappBarbearia = salaoRel?.telefone
      ? '55' + salaoRel.telefone.replace(/\D/g, '').replace(/^55/, '')
      : null

    const info = {
      status: ag.status,
      inicio: ag.data_hora_inicio,
      servico: nomeDe(ag.services as Rel),
      barbeiro: nomeDe(ag.professionals as Rel),
      barbearia: salaoRel?.nome ?? null,
      whatsappBarbearia,
    }

    if (body.acao === 'meu_horario') return json(info)

    // Cancelar: só horário ainda de pé, e com antecedência mínima — cancelar
    // em cima da hora é conversa com a barbearia, não botão.
    if (!['agendado', 'confirmado'].includes(ag.status)) {
      return json({ ...info, error: 'Esse horario ja nao esta mais de pe.' }, 409)
    }
    const doisHoras = 2 * 3600000
    if (new Date(ag.data_hora_inicio).getTime() - Date.now() < doisHoras) {
      return json(
        { ...info, error: 'Faltam menos de 2 horas — para mudar agora, chame a barbearia no WhatsApp.' },
        409,
      )
    }
    const { error: erroCancela } = await admin
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', ag.id)
    if (erroCancela) {
      console.error('Erro ao cancelar pelo token:', erroCancela)
      return json({ error: 'Nao foi possivel cancelar. Tente novamente.' }, 500)
    }
    return json({ ...info, status: 'cancelado', ok: true })
  }

  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Barbearia nao informada.' }, 400)

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

  // Freio do giro de 2026-08-25: sem ele, um robo criava um cliente novo por
  // requisicao e ocupava a grade inteira. 8 agendamentos por IP a cada 10 min
  // cobre a familia inteira marcando do mesmo wi-fi.
  {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    if (await taxaExcedida(admin, `agenda:${ipDe(req)}`, 8, 600)) {
      return json({ error: 'Muitos agendamentos seguidos. Aguarde alguns minutos e tente de novo.' }, 429)
    }
  }

  const nome = (body.nome as string | undefined)?.trim()
  const telefone = (body.telefone as string | undefined)?.replace(/\D/g, '') ?? ''
  const servicoId = body.servicoId as string | undefined
  const profissionalId = body.profissionalId as string | undefined
  const inicio = body.inicio as string | undefined

  if (!nome) return json({ error: 'Informe seu nome.' }, 400)
  // `telefone` já veio só com dígitos, então o length aqui é a mesma contagem
  // que o banco faz. A mensagem diz a faixa: sem ela a pessoa apaga e digita o
  // mesmo número de novo, achando que foi falha de conexão. Aqui o campo é
  // obrigatório — por isso não repete o "ou deixe em branco" do aviso do CRM.
  if (telefone.length < TELEFONE_MIN_DIGITOS || telefone.length > TELEFONE_MAX_DIGITOS) {
    return json(
      { error: `Telefone: informe DDD e número (${TELEFONE_MIN_DIGITOS} a ${TELEFONE_MAX_DIGITOS} dígitos).` },
      400,
    )
  }
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

  // Um agendamento futuro ativo por pessoa PELO QR. Impede a mesma pessoa de
  // tomar a agenda inteira, e é a trava que funciona mesmo com nome falso.
  //
  // Só conta o que nasceu aqui (`origem = 'publico'`). Antes contava qualquer
  // horário futuro — o que o barbeiro marcou no balcão, o que o agente marcou
  // no WhatsApp — e o cliente com corte marcado para quinta não conseguia usar
  // o QR na terça (achado 26 da revisão de 01/09). A trava é contra abuso do
  // QR, não contra ter dois horários; e quem abusa do QR o faz pelo QR.
  //
  // Lista positiva de status, em vez de "tudo menos cancelado e concluído":
  // é a mesma que o cancelamento pelo link usa, e não deixa passar um status
  // novo por esquecimento.
  if (clientId) {
    const { count: emAberto } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('origem', 'publico')
      .in('status', ['agendado', 'confirmado'])
      .gte('data_hora_inicio', new Date().toISOString())

    if ((emAberto ?? 0) > 0) {
      return json(
        { error: 'Voce ja marcou um horario por aqui e ele ainda esta de pe. Para mudar, fale com a barbearia.' },
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
    .select('id, data_hora_inicio, token_gestao')
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

  return json({
    ok: true,
    agendamentoId: agendamento.id,
    inicio: agendamento.data_hora_inicio,
    // O link de gestão: é assim que quem marcou pode cancelar sozinho depois.
    tokenGestao: agendamento.token_gestao,
  })
})
