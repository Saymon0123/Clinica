import { createClient } from 'jsr:@supabase/supabase-js@2'
import { comSentry } from '../_shared/sentry.ts'
import { chaveDoDia, motivoSemHorario } from '../_shared/semHorario.ts'
import { marcarSalao } from '../_shared/log.ts'
import { ipDe, taxaExcedida } from '../_shared/limite.ts'
import { numeroParaWhatsApp } from '../_shared/whatsapp.ts'
import { servicosPedidos, somaDuracao } from '../_shared/servicos.ts'

/**
 * Agenda pública — o QR do balcão.
 *
 * O cliente chega sem hora marcada, o barbeiro está cortando. Em vez de o
 * barbeiro parar para atendê-lo, o cliente escaneia o QR, vê o que está livre e
 * marca sozinho.
 *
 * **Roda sem usuário nenhum** (`verify_jwt: false`). Por isso toda a
 * autorização é explícita aqui dentro, e a superfície é mínima: dá para ver
 * horários livres e criar **um** agendamento dentro dos próximos `DIAS_VISIVEIS`
 * dias. Nada mais.
 *
 * O que ela deliberadamente **não** faz: listar clientes, nem mostrar de quem é
 * o agendamento que ocupa um horário. `horarios_livres` só devolve o que está
 * LIVRE — quem ocupa cada horário nunca sai daqui.
 *
 * "Agendar para outro dia" estava nesta lista até 13/09/2026 e saiu por decisão
 * do dono (etapa 2 do plano da agenda pelo QR). O que a janela custa em
 * superfície e o que continua segurando a porta estão escritos em
 * `DIAS_VISIVEIS`, logo abaixo.
 *
 * Cancelar e REMARCAR existem, mas NUNCA pela rua: só pelo `token_gestao` — um
 * uuid impossível de adivinhar, gerado por agendamento e entregue apenas a quem
 * marcou (tela de sucesso do QR, e o celular dele desde a etapa 3). Quem tem o
 * token mexe NAQUELE horário e em mais nada.
 *
 * "Remarcar é um link para o WhatsApp da barbearia" era o que esta linha dizia
 * até 13/09/2026. Deixou de ser: com a janela de catorze dias, escolher outro
 * horário virou dois toques numa grade que já está na tela, e mandar a pessoa
 * conversar para isso passou a ser atrito, não cuidado.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Teto de agendamentos públicos por barbearia por hora. Não é limite de uso —
 *  uma barbearia real não recebe 10 walk-ins numa hora. É disjuntor contra
 *  alguém que fotografou o QR e resolveu encher a agenda. */
const TETO_POR_HORA = 10

/**
 * Catorze dias — e a decisão de segurança que isto reverte.
 *
 * O comentário do topo desta função dizia, desde sempre: "agendar para outro
 * dia … viraria uma porta aberta na rua", e o `consultar` dizia "abrir a agenda
 * de outros dias transformaria isto na agenda pública inteira, com uma
 * superfície de abuso muito maior". O dono decidiu o contrário em 11/09, porque
 * um QR que só marca para hoje é metade de uma agenda: quem escaneia às 19h
 * bate num muro que o sistema mesmo levantou.
 *
 * O QUE PIORA, dito na cara:
 *
 * 1. O FORMATO da agenda de catorze dias fica público — dá para saber se a
 *    barbearia está cheia ou vazia. Continua sem vazar de QUEM é cada horário
 *    ocupado: `horarios_livres` só devolve o que está livre. É a mesma
 *    informação que um telefonema dá.
 * 2. A SUPERFÍCIE de quem quer encher a agenda passa de um dia para catorze.
 *    As três travas que já existiam continuam valendo e não dependem do dia:
 *    8 agendamentos por IP a cada 10 min, `TETO_POR_HORA` por barbearia, e um
 *    agendamento futuro aberto por pessoa pelo QR.
 * 3. O CUSTO do `consultar` multiplica por ~20 (a faixa de dias conta os
 *    catorze). E o `consultar` era a ÚNICA ação desta função SEM freio de
 *    taxa — o que antes era um descuido barato virou alavanca. Por isso o
 *    `taxaExcedida` novo lá embaixo: ele entra JUNTO com os catorze dias, não
 *    depois.
 *
 * A janela é fechada NOS DOIS CAMINHOS. Validar só no `consultar` deixaria o
 * `agendar` aceitar qualquer data por chamada direta — e é o `agendar` que
 * escreve no banco.
 */
const DIAS_VISIVEIS = 14

const TZ = 'America/Sao_Paulo'

/** 'YYYY-MM-DD' de hoje em São Paulo — o fuso da barbearia, não o do servidor. */
function hojeEmSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * 'YYYY-MM-DD' mais N dias. Meio-dia UTC de propósito: somar 24h a partir da
 * meia-noite escorrega um dia em toda mudança de horário de verão, e o Brasil
 * pode voltar a ter uma.
 */
function somaDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * A data pedida está dentro da janela? Recusa o que não for data de verdade —
 * '2026-02-31' casa com o formato e não existe, e `new Date` devolve Invalid
 * Date para ele. Comparar texto ISO funciona porque o formato é de largura
 * fixa e ordena igual à data.
 */
function dentroDaJanela(iso: string, hoje: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  if (Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime())) return false
  return iso >= hoje && iso <= somaDias(hoje, DIAS_VISIVEIS - 1)
}

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

/** '55' + DDD + número, só dígitos — pronto para o wa.me. Nulo sem telefone. */
// A montagem do numero mora em `_shared/whatsapp.ts` desde 13/09. O que havia
// aqui tirava o DDI e recolocava sem validar nada -- e, principalmente, nao
// sabia do nono digito: o telefone da El Guardians tem dez digitos, e o botao
// "Falar com a barbearia" dela apontava para um numero que nao existe.
const whatsappDe = numeroParaWhatsApp



Deno.serve(comSentry('agenda-publica', async (req: Request, ctx) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ------------------------------------------------------------------
  // Os horários guardados NESTE CELULAR (etapa 3).
  //
  // POR QUE UMA AÇÃO NOVA, e não chamar `meu_horario` uma vez por token: o
  // freio de gestão é de 12 chamadas por 10 minutos, e ele existe para tornar
  // caro martelar token. Buscando um por vez, quem tem dois horários salvos e
  // recarrega seis vezes bate no teto — o freio passaria a punir justamente o
  // cliente de casa. Aqui é UMA chamada para todos, e o freio segue inteiro.
  //
  // O teto de 12 chamadas × 5 tokens dá 60 tentativas por 10 min no lugar de
  // 12. Contra `gen_random_uuid()` (2^122 possibilidades) a diferença não
  // existe; o que o freio segura é o custo de banda e banco, e esse continua
  // sendo uma consulta por chamada.
  //
  // TOKEN DESCONHECIDO SOME DA RESPOSTA, sem erro. Dizer "esse não existe"
  // transformaria isto num verificador de tokens.
  // ------------------------------------------------------------------
  if (body.acao === 'meus_horarios') {
    const brutos = Array.isArray(body.tokens) ? (body.tokens as unknown[]).slice(0, 5) : []
    const tokens = [
      ...new Set(
        brutos.filter(
          (t): t is string =>
            typeof t === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.trim()),
        ),
      ),
    ].map((t) => t.trim())
    if (!tokens.length) return json({ horarios: [] })

    if (await taxaExcedida(admin, `gestao:${ipDe(req)}`, 12, 600, 'deixa-passar')) {
      return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
    }

    const { data: agendamentos, error: erroAg } = await admin
      .from('appointments')
      .select(
        'token_gestao, status, data_hora_inicio, data_hora_fim, professionals(nome), salons(nome, telefone)',
      )
      .in('token_gestao', tokens)
    if (erroAg) {
      console.error('Erro ao buscar horarios guardados:', erroAg)
      return json({ error: 'Não foi possível carregar seus horários.' }, 500)
    }

    // Os serviços de todos de uma vez: a ficha do celular mostra "Corte + barba",
    // não só o principal.
    const porToken = new Map((agendamentos ?? []).map((a) => [a.token_gestao as string, a]))
    const { data: linhas } = await admin
      .from('appointment_services')
      .select('appointment_id, ordem, services(nome), appointments!inner(token_gestao)')
      .in('appointments.token_gestao', tokens)
      .order('ordem')

    const servicosPorToken = new Map<string, string[]>()
    for (const linha of linhas ?? []) {
      const dono = (Array.isArray(linha.appointments) ? linha.appointments[0] : linha.appointments) as
        | { token_gestao: string }
        | null
      const servico = (Array.isArray(linha.services) ? linha.services[0] : linha.services) as
        | { nome: string | null }
        | null
      if (!dono?.token_gestao || !servico?.nome) continue
      const lista = servicosPorToken.get(dono.token_gestao) ?? []
      lista.push(servico.nome)
      servicosPorToken.set(dono.token_gestao, lista)
    }

    type Rel = { nome: string | null } | { nome: string | null }[] | null
    const nomeDe = (r: Rel) => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null

    // A ORDEM É A QUE O CELULAR PEDIU. Devolver na ordem do banco faria o
    // cartão de cima trocar de lugar entre uma carga e outra.
    const horarios = tokens
      .map((token) => {
        const ag = porToken.get(token)
        if (!ag) return null
        const salaoRel = (Array.isArray(ag.salons) ? ag.salons[0] : ag.salons) as
          | { nome: string | null; telefone: string | null }
          | null
        return {
          token,
          status: ag.status,
          inicio: ag.data_hora_inicio,
          fim: ag.data_hora_fim,
          servicos: servicosPorToken.get(token) ?? [],
          barbeiro: nomeDe(ag.professionals as Rel),
          barbearia: salaoRel?.nome ?? null,
          whatsappBarbearia: whatsappDe(salaoRel?.telefone),
        }
      })
      .filter((h) => h !== null)

    return json({ horarios })
  }

  // ------------------------------------------------------------------
  // Gestão pelo token: ver e cancelar O PRÓPRIO horário. Sem salonId de
  // propósito — o token resolve tudo, e não vaza nada de ninguém.
  // ------------------------------------------------------------------
  if (body.acao === 'meu_horario' || body.acao === 'cancelar_horario') {
    const token = (body.token as string | undefined)?.trim() ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return json({ error: 'Link inválido.' }, 400)
    }
    // Freio contra varredura de tokens: uuid aleatório já torna o chute
    // inviável, mas martelar também não fica de graça.
    if (await taxaExcedida(admin, `gestao:${ipDe(req)}`, 12, 600, 'deixa-passar')) {
      return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
    }

    const { data: ag } = await admin
      .from('appointments')
      .select(
        'id, salon_id, status, data_hora_inicio, data_hora_fim, services!appointments_service_id_fkey(nome), professionals(nome), salons(nome, telefone)',
      )
      .eq('token_gestao', token)
      .maybeSingle()
    if (!ag) return json({ error: 'Agendamento não encontrado.' }, 404)

    type Rel = { nome: string | null } | { nome: string | null }[] | null
    const nomeDe = (r: Rel) => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null
    const salaoRel = (Array.isArray(ag.salons) ? ag.salons[0] : ag.salons) as
      | { nome: string | null; telefone: string | null }
      | null
    const whatsappBarbearia = whatsappDe(salaoRel?.telefone)

    // TODOS os serviços, não só o principal. Quem marcou corte+barba pelo QR
    // abria o próprio link e lia "Corte" — e ficava sem saber se a barba tinha
    // entrado. `ordem` é a mesma que a pessoa escolheu na tela.
    const { data: servicosDoAg } = await admin
      .from('appointment_services')
      .select('ordem, services(nome, preco)')
      .eq('appointment_id', ag.id)
      .order('ordem')
    type ServicoRel = { nome: string | null; preco: number | null }
    const servicos = (servicosDoAg ?? [])
      .map((linha) => {
        const s = (Array.isArray(linha.services) ? linha.services[0] : linha.services) as
          | ServicoRel
          | null
        return s ? { nome: s.nome, preco: s.preco } : null
      })
      .filter((s): s is ServicoRel => !!s)

    const info = {
      status: ag.status,
      // A tela de remarcar precisa dele para abrir a grade da barbearia. Nao e
      // segredo: o mesmo id esta na URL publica `/agendar/:salonId`.
      salonId: ag.salon_id,
      inicio: ag.data_hora_inicio,
      fim: ag.data_hora_fim,
      // `servico` (singular) fica: é o que a tela antiga lê durante a janela
      // entre a edge subir e a Vercel terminar o build.
      servico: nomeDe(ag.services as Rel),
      servicos,
      barbeiro: nomeDe(ag.professionals as Rel),
      barbearia: salaoRel?.nome ?? null,
      whatsappBarbearia,
    }

    if (body.acao === 'meu_horario') return json(info)

    // Cancelar: só horário ainda de pé, e com um piso de 30 minutos.
    //
    // Eram 2 HORAS, e isso criava um caminho garantido de frustração: o lembrete
    // dispara entre T-85 e T-100min (fluxo `DW0nq1Jyp9xeOJwm`), ou seja, a ÚNICA
    // mensagem que o cliente recebe sobre o horário chegava 20 a 35 minutos
    // DEPOIS de o botão já ter travado. Ele avisava, e o sistema recusava o
    // aviso. Sempre, para todo mundo — não era caso raro.
    //
    // Pior: pelo botão do WhatsApp ele CONSEGUIA cancelar (`responder_lembrete`,
    // 0113:206, só exige `data_hora_inicio > now()`). Mesma ação, duas portas,
    // duas regras.
    //
    // 30 minutos (decisão do dono, 10/09) é o meio-termo: dá algum respiro para
    // a barbearia tentar revender a cadeira, e ainda assim cabe folgado depois
    // do lembrete. Quem cancela dentro dos 30 min ia faltar de qualquer jeito —
    // a diferença é o barbeiro ficar sabendo.
    if (!['agendado', 'confirmado'].includes(ag.status)) {
      return json({ ...info, error: 'Esse horário já não está mais de pé.' }, 409)
    }
    const pisoParaCancelar = 30 * 60000
    if (new Date(ag.data_hora_inicio).getTime() - Date.now() < pisoParaCancelar) {
      return json(
        { ...info, error: 'Falta menos de 30 minutos — para mudar agora, chame a barbearia no WhatsApp.' },
        409,
      )
    }
    const { error: erroCancela } = await admin
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', ag.id)
    if (erroCancela) {
      console.error('Erro ao cancelar pelo token:', erroCancela)
      return json({ error: 'Não foi possível cancelar. Tente novamente.' }, 500)
    }
    return json({ ...info, status: 'cancelado', ok: true })
  }

  // ------------------------------------------------------------------
  // Remarcar: MESMO agendamento, outro horário (etapa 4).
  //
  // REVERTE UMA DECISÃO ESCRITA. O comentário de `MeuHorarioPage.tsx` dizia:
  // "remarcar não remarca aqui de propósito: reagendar é conversa (outro dia,
  // outro horário, outra preferência), e conversa é com a barbearia no
  // WhatsApp". O dono decidiu o contrário em 11/09, e a razão é concreta — com
  // a janela de catorze dias, escolher outro horário deixou de ser conversa e
  // virou dois toques numa grade que já está na tela.
  //
  // MESMO AGENDAMENTO, MESMO TOKEN, de propósito: o link guardado no celular
  // (etapa 3) continua valendo depois de remarcar. Cancelar-e-recriar geraria
  // um token novo e mataria o link que a pessoa tem salvo — ela remarcaria e
  // perderia o acesso ao que acabou de marcar.
  //
  // NÃO MUDA O SERVIÇO. Remarcar é mudar QUANDO. Quem quer outro serviço
  // cancela e marca de novo — e aí o preço, a duração e a cadeira são outros.
  // ------------------------------------------------------------------
  if (body.acao === 'remarcar_horario') {
    const token = (body.token as string | undefined)?.trim() ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return json({ error: 'Link inválido.' }, 400)
    }
    if (await taxaExcedida(admin, `gestao:${ipDe(req)}`, 12, 600, 'deixa-passar')) {
      return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
    }

    const { data: ag } = await admin
      .from('appointments')
      .select('id, salon_id, status, data_hora_inicio, salons(nome, telefone)')
      .eq('token_gestao', token)
      .maybeSingle()
    if (!ag) return json({ error: 'Agendamento não encontrado.' }, 404)

    const salaoRel = (Array.isArray(ag.salons) ? ag.salons[0] : ag.salons) as
      | { nome: string | null; telefone: string | null }
      | null
    const whatsapp = whatsappDe(salaoRel?.telefone)

    if (!['agendado', 'confirmado'].includes(ag.status)) {
      return json({ error: 'Esse horário já não está mais de pé.', whatsappBarbearia: whatsapp }, 409)
    }

    // O PISO DE 30 MINUTOS VALE SOBRE O HORÁRIO ATUAL, não sobre o novo.
    // Mover às 14:50 um corte das 15:00 esvazia a cadeira das 15:00 com o mesmo
    // aviso em cima da hora que o cancelamento causaria — é a mesma dor, e por
    // isso a mesma regra (`private.pode_cancelar`, migration 0166).
    if (new Date(ag.data_hora_inicio).getTime() - Date.now() < 30 * 60000) {
      return json(
        {
          error:
            'Falta menos de 30 minutos para o seu horário. Para mudar agora, chame a barbearia — assim dá tempo de encaixar outra pessoa.',
          whatsappBarbearia: whatsapp,
        },
        409,
      )
    }

    const quando = new Date((body.inicio as string | undefined) ?? '')
    const profissionalId = body.profissionalId as string | undefined
    if (Number.isNaN(quando.getTime()) || !profissionalId) {
      return json({ error: 'Escolha um horário.' }, 400)
    }

    // A data sai do `inicio`, como no `agendar`: validar um campo e usar outro
    // é a brecha clássica.
    const diaNovo = quando.toLocaleDateString('en-CA', { timeZone: TZ })
    if (!dentroDaJanela(diaNovo, hojeEmSaoPaulo())) {
      return json(
        { error: `Só dá para marcar de hoje até ${DIAS_VISIVEIS} dias à frente.`, whatsappBarbearia: whatsapp },
        400,
      )
    }

    // A duração é a dos serviços QUE JÁ ESTÃO no agendamento — nada do corpo da
    // requisição decide quanto tempo de cadeira se reserva.
    const { data: linhas } = await admin
      .from('appointment_services')
      .select('services(duracao_minutos)')
      .eq('appointment_id', ag.id)
    const duracaoTotal = (linhas ?? []).reduce((total, linha) => {
      const s = (Array.isArray(linha.services) ? linha.services[0] : linha.services) as
        | { duracao_minutos: number | null }
        | null
      return total + (s?.duracao_minutos ?? 0)
    }, 0)
    if (duracaoTotal <= 0) {
      console.error('Agendamento sem duracao ao remarcar:', ag.id)
      return json({ error: 'Não foi possível remarcar. Fale com a barbearia.', whatsappBarbearia: whatsapp }, 500)
    }

    // `p_ignorar_agendamento` (migration 0169) é o que permite mover de 10:00
    // para 10:20: sem ele, o próprio agendamento esconde os horários vizinhos
    // do seu.
    const { data: livres } = await admin.rpc('horarios_livres', {
      p_salon_id: ag.salon_id,
      p_data: diaNovo,
      p_duracao_minutos: duracaoTotal,
      p_professional_id: profissionalId,
      p_ignorar_agendamento: ag.id,
    })
    const valido = (livres ?? []).some(
      (h: { inicio: string }) => new Date(h.inicio).getTime() === quando.getTime(),
    )
    if (!valido) {
      return json({ error: 'Esse horário não está mais disponível. Escolha outro.', conflito: true }, 409)
    }

    const { error: erroRemarcar } = await admin
      .from('appointments')
      .update({
        data_hora_inicio: quando.toISOString(),
        data_hora_fim: new Date(quando.getTime() + duracaoTotal * 60000).toISOString(),
        professional_id: profissionalId,
        // VOLTA A 'agendado' mesmo se estava 'confirmado': a pessoa confirmou a
        // hora ANTIGA. Deixar 'confirmado' mostraria ao barbeiro uma presença
        // confirmada para um horário que ninguém confirmou.
        status: 'agendado',
        // O LEMBRETE TEM DE SER REFEITO. Ele já foi enviado para a hora antiga,
        // e `lembrete_enviado` impediria o novo. Pior: `lembrete_message_id`
        // ainda apontaria para a mensagem velha, e o toque nos botões dela
        // agiria sobre este agendamento com a hora errada na resposta.
        lembrete_enviado: false,
        lembrete_message_id: null,
        lembrete_respondido_em: null,
        envio_reservado_ate: null,
        // O pedido de reagendamento foi atendido.
        reagendamento_pedido_em: null,
        remarcado_pelo_cliente_em: new Date().toISOString(),
      })
      .eq('id', ag.id)

    if (erroRemarcar) {
      // 23P01: duas pessoas mexeram no mesmo vão ao mesmo tempo, ou a folga
      // entre atendimentos foi violada. O banco recusou, que é o certo.
      const conflito = erroRemarcar.code === '23P01'
      if (!conflito) console.error('Erro ao remarcar:', erroRemarcar)
      return json(
        {
          error: conflito
            ? 'Esse horário acabou de ser pego. Escolha outro.'
            : 'Não foi possível remarcar. Tente novamente.',
          conflito,
        },
        conflito ? 409 : 500,
      )
    }

    return json({ ok: true, inicio: quando.toISOString(), whatsappBarbearia: whatsapp })
  }

  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Barbearia não informada.' }, 400)
  marcarSalao(ctx, salonId)

  // A barbearia existe, está ativa, está sendo atendida e tem o recurso ligado?
  //
  // `salons_atendendo` já embute "ativa e em dia" — reusar em vez de repetir a
  // regra é o que impede a página pública de continuar marcando horário numa
  // barbearia que parou de pagar.
  //
  // `telefone` entra no select por causa do achado de 04/09: TODO caminho que
  // termina em "não dá" precisa oferecer a conversa com a barbearia. O número
  // já existe no banco e o `/meu-horario` já o usa; faltava aqui, justamente
  // nas telas em que a pessoa não tem mais o que fazer sozinha.
  // `endereco` e `horario_funcionamento` saem daqui desde 13/09 para a tela ter
  // cara de barbearia (etapa 1 da agenda pelo QR v2): nome, "aberto agora",
  // endereço e WhatsApp no lugar do ícone do Club Cut. Os dois campos já
  // existiam em `salons` e na view — ninguém os mostrava, e quem escaneava o QR
  // às 21h não tinha como saber se o expediente tinha acabado ou se a agenda
  // estava só cheia.
  const { data: salao } = await admin
    .from('salons_atendendo')
    .select('id, nome, endereco, telefone, horario_funcionamento')
    .eq('id', salonId)
    .maybeSingle()

  if (!salao) {
    // `salons_atendendo` junta três situações numa só: barbearia desativada,
    // teste estourado e pagamento atrasado. Todas caíam aqui como "não
    // encontrada" — com o cartaz no balcão, o barbeiro cortando e o link certo
    // (A12 do giro de 10/09). Quem escaneou não precisa saber qual das três é,
    // e não deve: situação de cobrança é assunto da barbearia. Mas precisa de
    // uma saída, e o WhatsApp dela continua valendo.
    const { data: existe } = await admin
      .from('salons')
      .select('nome, telefone')
      .eq('id', salonId)
      .maybeSingle()
    if (existe) {
      const whatsapp = whatsappDe(existe.telefone)
      return json(
        {
          error: whatsapp
            ? 'Esta barbearia não está marcando horário por aqui agora. Chame no WhatsApp que eles resolvem.'
            : 'Esta barbearia não está marcando horário por aqui agora. Fale com a barbearia.',
          salao: existe.nome,
          whatsappBarbearia: whatsapp,
        },
        403,
      )
    }
    // Sem barbearia não há WhatsApp para oferecer: é o único beco que continua
    // beco, e por isso a frase diz para conferir o link em vez de mandar esperar.
    return json({ error: 'Barbearia não encontrada. Confira o link ou peça outro à barbearia.' }, 404)
  }

  const whatsappBarbearia = whatsappDe(salao.telefone)

  const { data: temRecurso } = await admin
    .from('recursos_ativos')
    .select('ativo')
    .eq('salon_id', salonId)
    .eq('recurso', 'agenda_publica')
    .maybeSingle()

  if (!temRecurso?.ativo) {
    return json(
      {
        error: 'Esta barbearia não marca horário por aqui. Chame no WhatsApp que eles resolvem.',
        salao: salao.nome,
        whatsappBarbearia,
      },
      403,
    )
  }

  // ------------------------------------------------------------------
  // Consultar: serviços e horários livres de HOJE.
  // ------------------------------------------------------------------
  if (body.acao === 'consultar') {
    // O freio que faltava. Até a etapa 2 o `consultar` era a única ação desta
    // função sem limite nenhum — sustentável enquanto ele custava uma consulta
    // de um dia; indefensável agora que conta catorze. 40 em 5 minutos cobre
    // com folga a família inteira marcando do mesmo wi-fi (cada carregamento
    // de página é 1, e trocar de serviço é mais 1), e ainda assim tira a
    // alavanca de quem quiser martelar.
    //
    // `deixa-passar` porque do outro lado está o cliente final: se a nossa
    // tabela de contagem cair, quem perde o horário é ele e quem perde o
    // cliente é a barbearia. O risco está escrito, não esquecido.
    if (await taxaExcedida(admin, `consulta:${ipDe(req)}`, 40, 300, 'deixa-passar')) {
      return json({ error: 'Muitas consultas seguidas. Aguarde um minuto e recarregue.' }, 429)
    }

    // MODO REMARCAR (etapa 4). O token diz QUAL agendamento esta sendo movido, e
    // isso muda duas coisas na grade:
    //
    //   1. os servicos sao os DELE, nao os que a tela pedir -- remarcar e mudar
    //      quando, nao o que se faz;
    //   2. a grade E a faixa de dias tem de IGNORA-LO, senao ele esconde os
    //      horarios vizinhos do proprio, e quem quer sair das 14:00 para as
    //      14:10 nao ve as 14:10.
    //
    // O token e conferido contra ESTE salao: token de uma barbearia aberto na
    // pagina de outra e recusado, em vez de virar uma grade que mistura as duas.
    const remarcarToken = (body.remarcarToken as string | undefined)?.trim()
    let remarcandoId: string | null = null
    let servicosDoRemarcado: string[] | null = null
    if (remarcarToken) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(remarcarToken)) {
        return json({ error: 'Link inválido.' }, 400)
      }
      const { data: aRemarcar } = await admin
        .from('appointments')
        .select('id, salon_id, status, appointment_services(service_id, ordem)')
        .eq('token_gestao', remarcarToken)
        .maybeSingle()
      if (
        !aRemarcar ||
        aRemarcar.salon_id !== salonId ||
        !['agendado', 'confirmado'].includes(aRemarcar.status)
      ) {
        return json({ error: 'Esse horário já não está mais de pé.', whatsappBarbearia }, 409)
      }
      remarcandoId = aRemarcar.id
      servicosDoRemarcado = (
        (aRemarcar.appointment_services ?? []) as { service_id: string; ordem: number }[]
      )
        .slice()
        .sort((x, y) => x.ordem - y.ordem)
        .map((linha) => linha.service_id)
    }

    // A identidade da barbearia, igual nos dois finais do `consultar`. Campos
    // NOVOS ao lado dos antigos, e não um `salao` virando objeto: a edge sobe
    // antes da Vercel terminar o build, e nesse intervalo a tela antiga
    // continua lendo `salao` como string. Campo a mais ela ignora; campo que
    // mudou de tipo quebraria o cabeçalho de todo mundo por alguns minutos.
    const identidade = {
      salao: salao.nome,
      endereco: salao.endereco,
      horarioFuncionamento: salao.horario_funcionamento,
      whatsappBarbearia,
    }

    const { data: servicos } = await admin
      .from('services')
      .select('id, nome, preco, duracao_minutos')
      .eq('salon_id', salonId)
      .eq('ativo', true)
      .order('preco')

    // Sem escolha nenhuma cai no primeiro do catálogo (ordenado por preço), que
    // é o que a tela sempre mostrou pré-selecionado.
    const pedidos = servicosPedidos(
      // Em modo remarcar a lista vem do AGENDAMENTO, nunca do corpo: trocar o
      // servico aqui mudaria preco e duracao sem passar pelo `remarcar_horario`,
      // que de proposito nao aceita servico nenhum.
      servicosDoRemarcado ? { servicoIds: servicosDoRemarcado } : body,
      servicos ?? [],
    )
    const escolhidos = pedidos.length ? pedidos : servicos?.slice(0, 1) ?? []
    const escolhido = escolhidos[0]
    const duracaoTotal = somaDuracao(escolhidos)

    if (!escolhido) {
      // Sem serviço ativo a tela mostrava um seletor vazio e mandava "tentar
      // outro serviço acima" (M8). Agora ela sabe o que dizer.
      return json({
        ...identidade,
        servicos: [],
        horarios: [],
        motivoVazio: 'sem_servicos',
      })
    }

    // A data pedida, validada AQUI e não na tela. Fora da janela é 400 e não
    // "cai para hoje em silêncio": quem pediu 2027 por engano precisa saber que
    // não deu, senão marca achando que marcou para outra data.
    const hoje = hojeEmSaoPaulo()
    const pedida = (body.data as string | undefined)?.trim()
    if (pedida && !dentroDaJanela(pedida, hoje)) {
      return json(
        { error: `Só dá para marcar de hoje até ${DIAS_VISIVEIS} dias à frente.`, whatsappBarbearia },
        400,
      )
    }
    const data = pedida || hoje
    const ehHoje = data === hoje

    const { data: horarios, error: erroHorarios } = await admin.rpc('horarios_livres', {
      p_salon_id: salonId,
      p_data: data,
      // A soma, não a duração do principal: é ela que decide se o encaixe cabe.
      p_duracao_minutos: duracaoTotal,
      p_ignorar_agendamento: remarcandoId,
    })

    if (erroHorarios) {
      console.error('Erro ao calcular horarios:', erroHorarios)
      return json({ error: 'Não foi possível carregar os horários.', whatsappBarbearia }, 500)
    }

    // A faixa de dias: quantos horários sobraram em cada um dos catorze.
    //
    // SEM A CONTAGEM a faixa seria uma armadilha — a pessoa toca terça, não
    // acha nada, toca quarta, não acha nada, e desiste no terceiro toque sem
    // nunca ver que sexta estava cheia de vaga. Um dia que parece disponível e
    // não está é pior que um dia marcado como cheio.
    //
    // Uma consulta só (`dias_com_horario`, migration 0167): medida em 20 ms
    // para os catorze na El Guardians. Catorze chamadas daqui seriam catorze
    // idas e voltas de rede.
    const { data: dias, error: erroDias } = await admin.rpc('dias_com_horario', {
      p_salon_id: salonId,
      p_de: hoje,
      p_dias: DIAS_VISIVEIS,
      p_duracao_minutos: duracaoTotal,
      // Sem isto a faixa diria "54 livres" e a grade mostraria 61 no mesmo dia.
      p_ignorar_agendamento: remarcandoId,
    })
    if (erroDias) console.error('Erro ao contar os dias:', erroDias)

    // Em que dias da semana ALGUÉM da equipe trabalha. A tela precisa disto
    // para separar "fechado" de "lotado" na faixa: um dia sem ninguém de
    // jornada não está cheio, está fechado — e `horarios_livres` devolve zero
    // para os dois.
    //
    // Substitui a consulta que antes só rodava quando a lista vinha vazia: esta
    // serve à faixa E ao motivo, então é uma no lugar de uma.
    const { data: jornadas } = await admin
      .from('professional_schedules')
      .select('dia_semana, professionals!inner(salon_id, ativo)')
      .eq('professionals.salon_id', salonId)
      .eq('professionals.ativo', true)
      .eq('ativo', true)
    // 0 = domingo, como o `extract(dow)` de `horarios_livres`.
    const diasDeTrabalho = [...new Set((jornadas ?? []).map((j) => j.dia_semana as number))].sort()

    // Lista vazia tem quatro causas, e a tela dizia a mesma frase para todas —
    // "tente outro serviço acima", inclusive às 23h e em dia de folga (M8). O
    // motivo vai junto para ela poder dizer a verdade.
    let motivoVazio: string | null = null
    if (!horarios?.length) {
      motivoVazio = motivoSemHorario({
        horario: salao.horario_funcionamento,
        dia: chaveDoDia(data),
        agora: new Date().toLocaleTimeString('en-GB', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }),
        alguemTrabalhaHoje: diasDeTrabalho.includes(new Date(`${data}T12:00:00Z`).getUTCDay()),
        // Só no dia de hoje o relógio decide alguma coisa. Num dia futuro,
        // "o expediente já acabou" seria a frase certa no dia errado.
        ehHoje,
      })
    }

    return json({
      ...identidade,
      servicos: servicos ?? [],
      // `servicoEscolhido` (singular) fica por compatibilidade: a tela antiga
      // le so ele durante os minutos entre a edge subir e a Vercel terminar.
      servicoEscolhido: escolhido.id,
      servicosEscolhidos: escolhidos.map((s) => s.id),
      duracaoTotal,
      /** O token CONFIRMADO pelo servidor. A tela so entra em modo remarcar
       *  quando ele volta -- token invalido nao vira uma tela que promete
       *  mudar um horario que nao existe. */
      remarcando: remarcandoId ? remarcarToken : null,
      data,
      dias: dias ?? [],
      diasDeTrabalho,
      horarios: horarios ?? [],
      motivoVazio,
    })
  }

  // ------------------------------------------------------------------
  // Agendar.
  // ------------------------------------------------------------------
  if (body.acao !== 'agendar') return json({ error: 'Ação inválida.' }, 400)

  // Freio do giro de 2026-08-25: sem ele, um robo criava um cliente novo por
  // requisicao e ocupava a grade inteira. 8 agendamentos por IP a cada 10 min
  // cobre a familia inteira marcando do mesmo wi-fi.
  {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    if (await taxaExcedida(admin, `agenda:${ipDe(req)}`, 8, 600, 'deixa-passar')) {
      return json({ error: 'Muitos agendamentos seguidos. Aguarde alguns minutos e tente de novo.' }, 429)
    }
  }

  const nome = (body.nome as string | undefined)?.trim()
  const telefone = (body.telefone as string | undefined)?.replace(/\D/g, '') ?? ''
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
  if (!profissionalId || !inicio) {
    return json({ error: 'Escolha um horário.' }, 400)
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
    return json(
      { error: 'Muitos agendamentos agora. Fale com a barbearia pelo WhatsApp.', whatsappBarbearia },
      429,
    )
  }

  // O catálogo inteiro do salão, e os pedidos resolvidos contra ele. Ler os
  // serviços pelo id de um em um deixaria passar id de outro salão em uma das
  // consultas; aqui a lista de partida JÁ é só deste salão e só ativa.
  const { data: catalogo } = await admin
    .from('services')
    .select('id, duracao_minutos')
    .eq('salon_id', salonId)
    .eq('ativo', true)

  const servicos = servicosPedidos(body, catalogo ?? [])
  if (!servicos.length) return json({ error: 'Serviço indisponível.' }, 400)
  const duracaoTotal = somaDuracao(servicos)
  if (duracaoTotal <= 0) return json({ error: 'Serviço indisponível.' }, 400)

  // O horário pedido é mesmo um dos livres DAQUELE dia?
  //
  // Sem esta checagem, a janela de catorze dias existiria apenas na tela: quem
  // chamasse a função direto podia marcar às 3h da manhã, num dia em que a
  // barbearia fecha, com um barbeiro que não trabalha, ou para daqui a dois
  // anos. A trava de sobreposição do banco impede colisão, mas não impede
  // horário absurdo.
  //
  // A DATA SAI DO `inicio`, nunca de um campo à parte do corpo. Aceitar uma
  // `data` enviada junto criaria a brecha clássica: validar um valor e usar
  // outro — pedir `data: hoje` e `inicio` em 2027 passaria pelo teto da janela
  // e escreveria a data de 2027 no banco.
  const quandoPedido = new Date(inicio)
  if (Number.isNaN(quandoPedido.getTime())) {
    return json({ error: 'Escolha um horário.' }, 400)
  }
  const diaDoPedido = quandoPedido.toLocaleDateString('en-CA', { timeZone: TZ })
  if (!dentroDaJanela(diaDoPedido, hojeEmSaoPaulo())) {
    return json(
      { error: `Só dá para marcar de hoje até ${DIAS_VISIVEIS} dias à frente.`, whatsappBarbearia },
      400,
    )
  }

  // Revalidar contra a mesma função que gerou a lista fecha a porta e, de
  // quebra, resolve o caso de alguém deixar a tela aberta por meia hora: o
  // horário some da lista e a marcação é recusada com explicação.
  const { data: livres } = await admin.rpc('horarios_livres', {
    p_salon_id: salonId,
    p_data: diaDoPedido,
    // A SOMA. Revalidar com a duração do principal aceitaria um corte+barba de
    // 70 min num vão de 40 — a trava de sobreposição do banco recusaria depois,
    // mas com a mensagem errada; e num vão folgado ela passaria, reservando
    // menos tempo que o atendimento leva.
    p_duracao_minutos: duracaoTotal,
    p_professional_id: profissionalId,
  })

  const pedido = quandoPedido.getTime()
  const valido = (livres ?? []).some(
    (h: { inicio: string }) => new Date(h.inicio).getTime() === pedido,
  )

  if (!valido) {
    return json({ error: 'Esse horário não está mais disponível. Escolha outro.', conflito: true }, 409)
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
  //
  // ─── O QUE ESTA TRAVA VIROU COM CATORZE DIAS (13/09/2026) ─────────────────
  //
  // Ela ficou MUITO mais apertada do que era, e isso não é acidente de código,
  // é consequência da janela. Com "só hoje", ter um agendamento futuro pelo QR
  // era raro — durava algumas horas. Com catorze dias, quem marcar para sábado
  // fica bloqueado por catorze dias: não consegue marcar a barba de quinta.
  //
  // MANTIDA EM 1 DE PROPÓSITO, e a decisão é do dono, não minha. Mantê-la é o
  // estado atual (nada regride) e é o lado seguro. Afrouxar é uma escolha de
  // negócio: mais gente marcando dois serviços na mesma semana, e menos atrito
  // com quem quer.
  //
  // A resposta certa provavelmente não é "2 em vez de 1": é a ETAPA 4, em que
  // a pessoa que já tem horário o VÊ e pode remarcar. Aí "você já marcou" deixa
  // de ser um não e vira "aqui está o seu — quer trocar?".
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
        {
          error:
            'Você já marcou um horário por aqui e ele ainda está de pé. Para mudar, fale com a barbearia.',
          whatsappBarbearia,
        },
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
      return json({ error: 'Não foi possível concluir. Tente novamente.' }, 500)
    }
    clientId = novo.id
    clienteCriadoAgora = true
  }

  // `data_hora_fim` VAI EXPLÍCITO, e essa é a decisão que impede overbooking.
  //
  // Até aqui quem calculava era o trigger `calcula_fim_do_agendamento`. Ele
  // soma `appointment_services` — mas num INSERT a filha ainda está vazia, e
  // ele cai no serviço principal (está escrito no código dele: "se a filha
  // ainda não tem linhas — INSERT, o espelho roda depois — cai no serviço
  // principal"). Num corte+barba de 70 min isso reservaria 40, e a trava de
  // sobreposição liberaria os 30 minutos finais para outra pessoa. Duas
  // pessoas, uma cadeira, e o barbeiro descobrindo no balcão.
  //
  // O mesmo trigger tem uma porta para isto: `if tg_op = 'INSERT' and
  // new.data_hora_fim is not null then return new`. Mandando o fim já somado, a
  // trava de sobreposição reserva o tempo inteiro no PRIMEIRO instante — antes
  // mesmo de a filha existir. É o único ponto em que a corrida importa.
  const fim = new Date(quandoPedido.getTime() + duracaoTotal * 60000).toISOString()
  const { data: agendamento, error: erroAgendamento } = await admin
    .from('appointments')
    .insert({
      salon_id: salonId,
      client_id: clientId,
      professional_id: profissionalId,
      // O principal é o primeiro escolhido: é o que a agenda do CRM, a fatura e
      // o histórico do cliente leem quando leem um serviço só.
      service_id: servicos[0].id,
      data_hora_inicio: inicio,
      data_hora_fim: fim,
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
          ? 'Esse horário acabou de ser pego. Escolha outro.'
          : 'Não foi possível agendar. Tente novamente.',
        conflito,
      },
      conflito ? 409 : 500,
    )
  }

  // Os serviços além do principal. O principal já entrou sozinho, pelo trigger
  // `trg_espelha_servico_principal` (0120) — por isso o `slice(1)` e o
  // `ignoreDuplicates`.
  //
  // NÃO uso `definir_servicos_do_agendamento`: aquela RPC exige que o chamador
  // tenha vínculo com o salão (`private.salon_ids()`), e aqui não há usuário
  // nenhum. Ela continua sendo a porta do CRM.
  if (servicos.length > 1) {
    const { error: erroServicos } = await admin
      .from('appointment_services')
      .upsert(
        servicos.slice(1).map((s, i) => ({
          appointment_id: agendamento.id,
          service_id: s.id,
          ordem: i + 2,
        })),
        { ignoreDuplicates: true },
      )

    // Falhou aqui: o horário está reservado pelo tempo certo, mas a lista de
    // serviços ficaria pela metade — o cliente marcou corte+barba e a barbearia
    // veria só corte, cobrando menos e reservando mais. Desfaz tudo em vez de
    // deixar um agendamento que mente. Mesma compensação do cliente órfão.
    if (erroServicos) {
      console.error('Erro ao gravar os servicos do agendamento:', erroServicos)
      await admin.from('appointments').delete().eq('id', agendamento.id)
      if (clienteCriadoAgora && clientId) {
        await admin.from('clients').delete().eq('id', clientId)
      }
      return json({ error: 'Não foi possível agendar. Tente novamente.' }, 500)
    }
  }

  return json({
    ok: true,
    agendamentoId: agendamento.id,
    inicio: agendamento.data_hora_inicio,
    // O link de gestão: é assim que quem marcou pode cancelar sozinho depois.
    tokenGestao: agendamento.token_gestao,
  })
}))
