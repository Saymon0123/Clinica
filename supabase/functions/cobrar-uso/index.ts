import { createClient } from 'jsr:@supabase/supabase-js@2'
import { capturarErro, comSentry } from '../_shared/sentry.ts'
import type { ClienteAdmin } from '../_shared/supabase.ts'

/**
 * Transforma faturas de uso abertas em cobranças PIX no AbacatePay.
 *
 * Roda pelo n8n a cada hora, ANTES do notificador — assim o e-mail já sai com
 * o copia-e-cola/QR. É idempotente por desenho: só olha fatura com
 * `abacate_pix_id` nulo e valor > 0, então disparar de novo não cobra ninguém
 * duas vezes. Mesmo assim o gatilho exige a service key: idempotência protege
 * contra cobrança dupla, não contra antecipação forçada nem contra martelar a
 * API do AbacatePay com um JWT qualquer.
 *
 * Três regras que moram aqui:
 *
 * - **Mínimo de cobrança (R$ 5).** Já NÃO é limite do provedor (o AbacatePay
 *   aceita centavos) — é escolha nossa para não gerar cobrança minúscula: grupo
 *   abaixo disso ACUMULA para o próximo ciclo. Uma cobrança pode cobrir várias
 *   faturas, e é o `abacate_pix_id` compartilhado que registra isso.
 * - **Rede com cobrança única** (`organizations.cobranca_unificada`): as faturas
 *   de todas as unidades entram numa cobrança só, com `externalId = rede:<orgId>`
 *   — que o webhook entende e usa para estender todas as unidades de uma vez.
 * - **Sem CPF/CNPJ não há cobrança.** O grupo é pulado e a fatura fica aberta; o
 *   CRM pede o documento na aba Assinatura.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ABACATE_API_KEY = Deno.env.get('ABACATE_API_KEY')
// Sem fallback de propósito: sandbox silencioso em produção é pior que falhar.
const ABACATE_BASE_URL = Deno.env.get('ABACATE_BASE_URL')

/** Abaixo disso não geramos cobrança; o valor acumula para o próximo ciclo. */
const MINIMO_COBRANCA = 5
const DIAS_ATE_O_VENCIMENTO = 7

// O cron chama servidor-a-servidor, mas a reemissão vem do navegador do dono.
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

/** Limite de tentativas via banco (0111). Erro do limitador deixa passar. */
async function taxaExcedida(
  admin: ClienteAdmin,
  chave: string,
  limite: number,
  janelaSegundos: number,
) {
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

async function abacate(caminho: string, init: RequestInit = {}) {
  const res = await fetch(`${ABACATE_BASE_URL}${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ABACATE_API_KEY!}`,
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

type FaturaAberta = {
  id: string
  salon_id: string
  periodo_inicio: string
  periodo_fim: string
  valor: number
}

/**
 * Só o gatilho interno (n8n com a service key) pode disparar. A idempotência
 * continua valendo, mas ela protege contra cobrança dupla — não contra
 * antecipação forçada nem contra martelar a API do AbacatePay com JWT qualquer.
 */
function chamadorAutorizado(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const esperado = SERVICE_ROLE_KEY
  if (token.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) diff |= token.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diff === 0
}

/**
 * O botão "Gerar novo Pix" da aba Assinatura.
 *
 * Não cria cobrança nenhuma: apenas LIBERA a dívida (zera o `abacate_pix_id`,
 * guardando o antigo) para o fluxo normal abaixo gerar outra. A criação mora num
 * lugar só, de propósito — duplicá-la aqui era o erro mais caro possível.
 *
 * Age sobre a COBRANÇA, não sobre o salão: em rede unificada um PIX cobre várias
 * unidades, e liberar só as faturas de uma delas partiria o agrupamento no meio.
 *
 * Devolve `Response` quando recusa, ou `null` quando liberou e o fluxo segue.
 */
async function liberarParaReemissao(
  req: Request,
  admin: ClienteAdmin,
  body: Record<string, unknown>,
): Promise<Response | null> {
  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return json({ error: 'Nao autorizado.' }, 401)

  const pixId = (body.pixId as string | undefined)?.trim()
  if (!pixId) return json({ error: 'Cobranca nao informada.' }, 400)

  // O JWT de quem clicou responde pela identidade real via RLS — o service_role
  // ignora RLS e não serve para autorizar.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: quemChamou } = await comoUsuario.auth.getUser()
  const usuario = quemChamou?.user
  if (!usuario) return json({ error: 'Nao autorizado.' }, 401)

  const { data: faturas, error: erroFaturas } = await admin
    .from('faturas_de_uso')
    .select('id, salon_id, paga_em, pix_expira_em')
    .eq('abacate_pix_id', pixId)
  if (erroFaturas) {
    console.error('Erro ao ler a cobranca para reemissao:', erroFaturas)
    return json({ error: 'erro interno' }, 500)
  }
  if (!faturas || faturas.length === 0) return json({ error: 'Cobranca nao encontrada.' }, 404)

  if (faturas.some((f) => f.paga_em !== null)) {
    return json({ error: 'Esta cobranca ja foi paga.' }, 409)
  }

  // Recusar QR vivo não é preciosismo: gerar outro invalidaria justamente o
  // código que o dono pode ter em mãos e estar prestes a pagar.
  const agora = Date.now()
  if (faturas.some((f) => f.pix_expira_em && new Date(f.pix_expira_em).getTime() > agora)) {
    return json({ error: 'Este Pix ainda esta valido. Use o codigo que ja esta na tela.' }, 409)
  }

  // Dono de ALGUMA unidade coberta pela cobrança. `.eq('user_id')` é obrigatório:
  // a RLS deixa gestor enxergar os vínculos da equipe inteira, então filtrar só
  // por salon_id devolveria o papel de um colega.
  const salonIds = [...new Set(faturas.map((f) => f.salon_id))]
  const { data: vinculos } = await comoUsuario
    .from('user_salons')
    .select('salon_id')
    .eq('user_id', usuario.id)
    .eq('role', 'owner')
    .in('salon_id', salonIds)
  if (!vinculos || vinculos.length === 0) {
    return json({ error: 'Apenas o dono pode gerar uma nova cobranca.' }, 403)
  }

  // Sem freio, o botão vira um martelo na API do AbacatePay.
  if (await taxaExcedida(admin, `reemitir:${vinculos[0].salon_id}`, 3, 3600)) {
    return json({ error: 'Voce ja gerou varios codigos agora. Aguarde alguns minutos.' }, 429)
  }

  const { error: erroLibera } = await admin.rpc('liberar_cobranca_para_reemissao', {
    p_pix_id: pixId,
  })
  if (erroLibera) {
    console.error('Erro ao liberar a cobranca para reemissao:', erroLibera)
    await capturarErro(erroLibera, 'cobrar-uso', { onde: 'liberar_cobranca_para_reemissao', pixId })
    return json({ error: 'Nao foi possivel gerar uma nova cobranca. Tente de novo.' }, 500)
  }

  return null
}

Deno.serve(comSentry('cobrar-uso', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ABACATE_API_KEY || !ABACATE_BASE_URL) {
    console.error('ABACATE_API_KEY ou ABACATE_BASE_URL ausente.')
    return json({ error: 'Cobranca nao configurada.' }, 500)
  }

  // Duas portas: o cron (service key, corpo vazio) e o botão "Gerar novo Pix"
  // do dono (JWT dele, `acao: 'reemitir'`). A trava da service key vale só para
  // a primeira — a segunda tem a sua própria, mais estrita.
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // O cron chama sem corpo. Não é erro.
  }
  const ehReemissao = body.acao === 'reemitir'
  if (!ehReemissao && !chamadorAutorizado(req)) return json({ error: 'Não autorizado.' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  if (ehReemissao) {
    const recusa = await liberarParaReemissao(req, admin, body)
    if (recusa) return recusa
  }

  const { data: faturas, error: erroFaturas } = await admin
    .from('faturas_de_uso')
    .select('id, salon_id, periodo_inicio, periodo_fim, valor')
    .is('abacate_pix_id', null)
    .gt('valor', 0)
  if (erroFaturas) {
    console.error('Erro ao listar faturas abertas:', erroFaturas)
    return json({ error: 'erro interno' }, 500)
  }
  if (!faturas || faturas.length === 0) {
    return json({ cobrancas: 0, faturasCobertas: 0, acumuladas: 0, semDocumento: 0 })
  }

  // Recicla reserva órfã: a execução que reservou morreu entre reservar e
  // gravar (timeout da edge, deploy no meio, queda). Sem isto a fatura ficaria
  // reservada para sempre e nunca mais seria cobrada — trocaríamos cobrança
  // dupla por cobrança nenhuma, que é pior.
  //
  // 10 minutos é folgado de propósito: a chamada ao AbacatePay leva segundos, e
  // reciclar cedo demais recria exatamente a corrida que esta reserva existe
  // para impedir.
  const limiteDaReserva = new Date(Date.now() - 10 * 60_000).toISOString()
  const { error: erroReciclagem } = await admin
    .from('faturas_de_uso')
    .update({ cobranca_reservada_em: null })
    .is('abacate_pix_id', null)
    .lt('cobranca_reservada_em', limiteDaReserva)
  if (erroReciclagem) {
    console.error('Erro ao reciclar reservas orfas:', erroReciclagem)
    await capturarErro(erroReciclagem, 'cobrar-uso', { onde: 'reciclar-reservas' })
  }

  const salonIds = [...new Set(faturas.map((f) => f.salon_id))]
  const [{ data: salons }, { data: subs }] = await Promise.all([
    admin
      .from('salons')
      .select('id, nome, organization_id, organizations ( id, nome, cobranca_unificada, cpf_cnpj )')
      .in('id', salonIds),
    admin.from('subscriptions').select('salon_id, cpf_cnpj').in('salon_id', salonIds),
  ])

  type Org = {
    id: string
    nome: string
    cobranca_unificada: boolean
    cpf_cnpj: string | null
  }

  // Agrupa: rede unificada junta as unidades; o resto é por barbearia.
  type Grupo = {
    chave: string
    rede: Org | null
    salonId: string | null
    faturas: FaturaAberta[]
  }
  const grupos = new Map<string, Grupo>()
  for (const f of faturas as FaturaAberta[]) {
    const salon = salons?.find((s) => s.id === f.salon_id)
    const org = (salon?.organizations ?? null) as Org | null
    const unificada = Boolean(org?.cobranca_unificada)
    const chave = unificada ? `rede:${org!.id}` : f.salon_id
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, rede: unificada ? org : null, salonId: unificada ? null : f.salon_id, faturas: [] })
    }
    grupos.get(chave)!.faturas.push(f)
  }

  let cobrancas = 0
  let faturasCobertas = 0
  let acumuladas = 0
  let semDocumento = 0

  for (const grupo of grupos.values()) {
    const total = Number(grupo.faturas.reduce((acc, f) => acc + Number(f.valor), 0).toFixed(2))
    if (total < MINIMO_COBRANCA) {
      acumuladas += grupo.faturas.length
      continue
    }

    // Pagante: a rede, ou a barbearia.
    let cpfCnpj: string | null
    let nomePagante: string
    if (grupo.rede) {
      cpfCnpj = grupo.rede.cpf_cnpj
      nomePagante = grupo.rede.nome
    } else {
      const sub = subs?.find((s) => s.salon_id === grupo.salonId)
      cpfCnpj = sub?.cpf_cnpj ?? null
      nomePagante = salons?.find((s) => s.id === grupo.salonId)?.nome ?? 'Barbearia'
    }

    if (!cpfCnpj) {
      // Sem documento a fatura fica aberta; o CRM pede o CPF/CNPJ e o próximo
      // ciclo tenta de novo.
      semDocumento += grupo.faturas.length
      continue
    }

    const venceEm = new Date(Date.now() + DIAS_ATE_O_VENCIMENTO * 86400000)
    const venceEmData = venceEm.toISOString().slice(0, 10) // date do bloqueio (7 dias)
    const fimMaisRecente = grupo.faturas
      .map((f) => f.periodo_fim)
      .sort()
      .at(-1)!
    const periodoBr = fimMaisRecente.split('-').reverse().join('/')
    const descricao = grupo.rede
      ? `Club Cut - uso da rede ${nomePagante} ate ${periodoBr}`
      : grupo.faturas.length > 1
        ? `Club Cut - uso acumulado ate ${periodoBr} - ${nomePagante}`
        : `Club Cut - uso ate ${periodoBr} - ${nomePagante}`

    // ------------------------------------------------------------------
    // RESERVA — antes de gastar do outro lado.
    //
    // Esta é a linha que separa "cobrança dupla detectada" de "cobrança dupla
    // impossível". Reivindicar é um UPDATE condicional: só pega fatura que
    // ainda está livre E não reservada. Duas execuções sobrepostas disputam
    // aqui, no banco, onde a disputa é resolvida — e não lá fora, onde os dois
    // PIX já teriam nascido.
    //
    // Reivindicação PARCIAL não serve: se o grupo tem 3 faturas e eu só
    // consegui 2, a outra execução está com a terceira e vai cobrar o grupo
    // inteiro. Solto o que peguei e saio — ela cobra, eu não.
    // ------------------------------------------------------------------
    const ids = grupo.faturas.map((f) => f.id)
    const { data: reservadas, error: erroReserva } = await admin
      .from('faturas_de_uso')
      .update({ cobranca_reservada_em: new Date().toISOString() })
      .in('id', ids)
      .is('abacate_pix_id', null)
      .is('cobranca_reservada_em', null)
      .select('id')
    if (erroReserva) {
      console.error('Erro ao reservar a cobranca:', erroReserva, grupo.chave)
      await capturarErro(erroReserva, 'cobrar-uso', { onde: 'reservar', chave: grupo.chave })
      continue
    }

    const soltar = async () => {
      const { error } = await admin
        .from('faturas_de_uso')
        .update({ cobranca_reservada_em: null })
        .in('id', (reservadas ?? []).map((f) => f.id))
        .is('abacate_pix_id', null)
      if (error) {
        // A reserva presa some sozinha em 10 min pela reciclagem do topo; o que
        // não pode é isso passar despercebido.
        console.error('Erro ao soltar a reserva:', error, grupo.chave)
        await capturarErro(error, 'cobrar-uso', { onde: 'soltar-reserva', chave: grupo.chave })
      }
    }

    if ((reservadas?.length ?? 0) !== ids.length) {
      console.log('grupo pulado: outra execucao esta com ele', grupo.chave,
        (reservadas?.length ?? 0), 'de', ids.length)
      await soltar()
      continue
    }

    // Cobrança PIX de valor variável (por uso). amount em CENTAVOS.
    //
    // O QR vale 7 dias a partir de AGORA, e isso deixou de ser o mesmo que
    // `cobranca_vence_em`. Amarrar os dois foi o defeito original: o código
    // morria no exato instante em que o bloqueio começava, e quem pagasse com um
    // dia de atraso ficava bloqueado sem meio nenhum de pagar. Agora o prazo da
    // dívida é fixo e o QR é renovável.
    const cobranca = await abacate('/transparents/create', {
      method: 'POST',
      body: JSON.stringify({
        method: 'PIX',
        data: {
          amount: Math.round(total * 100),
          expiresIn: DIAS_ATE_O_VENCIMENTO * 86400,
          description: descricao,
          // externalId ajuda a reconciliar no painel do AbacatePay. O roteio de
          // acesso, porém, o webhook faz pelo abacate_pix_id gravado na fatura
          // (decidir pelo banco, não pelo payload).
          externalId: grupo.chave,
        },
      }),
    })
    const pix = cobranca.data?.data
    if (!cobranca.ok || !pix?.id) {
      console.error('AbacatePay recusou a cobranca', grupo.chave, cobranca.status, cobranca.data)
      // Nada nasceu do outro lado: soltar na hora, para o próximo ciclo tentar
      // em vez de esperar os 10 minutos da reciclagem.
      await soltar()
      continue
    }

    // Grava o PIX e SOLTA a reserva no mesmo UPDATE: enquanto `abacate_pix_id`
    // estiver preenchido, ele é que responde pela exclusividade — reserva viva
    // aqui só serviria para prender a linha se algo falhasse depois.
    //
    // O `.is('abacate_pix_id', null)` continua, agora como cinto e suspensório:
    // a reserva já garante que ninguém mais está neste grupo. Se um dia alguém
    // mexer numa das duas travas, a outra ainda segura.
    const { data: marcadas, error: erroMarca } = await admin
      .from('faturas_de_uso')
      .update({
        abacate_pix_id: pix.id,
        pix_br_code: pix.brCode ?? null,
        pix_br_code_base64: pix.brCodeBase64 ?? null,
        pix_expira_em: venceEm.toISOString(),
        cobranca_valor: total,
        cobranca_reservada_em: null,
        // `cobranca_vence_em` NÃO entra aqui — vai logo abaixo, e só onde ainda
        // é nulo. Numa reemissão a dívida é a mesma e o prazo dela não anda;
        // escrever daqui daria +7 dias de acesso a cada clique no botão.
      })
      .in('id', ids)
      .is('abacate_pix_id', null)
      .select('id')
    if (!erroMarca && (marcadas?.length ?? 0) !== ids.length) {
      // Com a reserva no lugar, chegar aqui não deveria ser possível: as faturas
      // foram reivindicadas antes de o PIX nascer. Se acontecer, alguém escreveu
      // no banco por fora do `cobrar-uso` — e existe um PIX real solto no
      // AbacatePay que ninguém vai rotear. Alerta com o id para reconciliar.
      const perdidas = ids.length - (marcadas?.length ?? 0)
      console.error('Reserva furada: fatura mudou entre reservar e gravar', grupo.chave, pix.id, perdidas)
      await capturarErro(
        new Error(`Reserva furada: PIX ${pix.id} nasceu para ${perdidas} fatura(s) que mudaram por fora`),
        'cobrar-uso',
        { onde: 'reserva-furada', chave: grupo.chave, pixId: pix.id, perdidas },
      )
    }
    if (erroMarca) {
      // A cobrança existe no AbacatePay mas não ficou registrada. Um PIX que o
      // dono nunca recebe apenas expira sem pagamento — não há cobrança dupla a
      // desfazer.
      console.error('Erro ao registrar a cobranca PIX (o PIX orfao expira sozinho):', erroMarca, grupo.chave)
      await capturarErro(erroMarca, 'cobrar-uso', { onde: 'gravar-pix', chave: grupo.chave, pixId: pix.id })
      // Solta a reserva: sem isto a fatura ficaria presa até a reciclagem de 10
      // minutos, e o próximo ciclo passaria batido por ela.
      await soltar()
      continue
    }

    // O prazo da dívida, em statement separado e SÓ onde ainda é nulo.
    // Fatura reemitida já tem o seu e o mantém — é o que impede o botão "Gerar
    // novo Pix" de virar "adiar o bloqueio". Fatura nova recebe hoje + 7.
    const { error: erroPrazo } = await admin
      .from('faturas_de_uso')
      .update({ cobranca_vence_em: venceEmData })
      .in(
        'id',
        (marcadas ?? []).map((f) => f.id),
      )
      .is('cobranca_vence_em', null)
    if (erroPrazo) {
      // O PIX está gravado e é pagável; só o prazo do bloqueio não ficou. Sem
      // ele o cron não bloqueia esta fatura — dinheiro parado, em silêncio.
      console.error('Erro ao gravar o vencimento da cobranca:', erroPrazo, grupo.chave)
      await capturarErro(erroPrazo, 'cobrar-uso', { onde: 'gravar-vencimento', chave: grupo.chave })
    }

    cobrancas += 1
    // O que foi GRAVADO, não o que foi tentado: se algum dia os dois
    // números divergem, e é o primeiro que diz a verdade sobre o banco.
    faturasCobertas += marcadas?.length ?? 0
  }

  return json({ cobrancas, faturasCobertas, acumuladas, semDocumento })
}))
