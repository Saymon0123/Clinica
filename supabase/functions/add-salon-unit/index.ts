import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Cria uma unidade nova a partir de uma barbearia que o chamador já possui.
 *
 * **Rede não é um cadastro, é uma promoção.** Ninguém se apresenta como "uma
 * rede": o dono tem uma barbearia que deu certo e abre a segunda. Por isso a
 * entrada do produto é uma só, e a rede acontece aqui, no primeiro "Adicionar
 * unidade" — se a barbearia de origem ainda não pertence a uma organização,
 * esta função cria a organização, anexa a origem como primeira unidade e só
 * então cria a segunda. O dono nunca vê a palavra "organização".
 *
 * Antes disto, a função exigia `organizationId`: só quem JÁ era rede conseguia
 * adicionar unidade, e nada no sistema criava organizações — a única rede
 * existente tinha nascido por SQL na mão. O ovo e a galinha.
 *
 * **A unidade nasce com assinatura.** A versão anterior não criava
 * `subscriptions`, e uma unidade sem assinatura some de `salons_com_automacao`
 * (sem lembrete, sem agente) e abre `/assinatura` num estado de "cadastrada
 * antes do controle". Herda o plano da origem, em teste curto: dá para operar
 * a filial antes de pagar, sem virar brecha de teste infinito.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Curto de propósito: a matriz já conhece o produto. */
const DIAS_DE_TESTE_DA_UNIDADE = 7
const PLANO_FALLBACK = 'basico'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

  // Cliente com o token do usuário: serve só para descobrir quem está chamando.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)
  const userId = userData.user.id

  let body: {
    /** A barbearia de onde a unidade nasce. É ela que vira (ou já é) a rede. */
    salonId?: string
    nome?: string
    endereco?: string
    telefone?: string
    horario_funcionamento?: unknown
    /** Padrão true: filial quase sempre vende o mesmo que a matriz. */
    copiarCatalogo?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }

  const nome = body.nome?.trim()
  if (!nome) return json({ error: 'Informe o nome da unidade.' }, 400)
  if (!body.salonId) return json({ error: 'Barbearia de origem não informada.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Autorização: só o DONO da origem abre unidade a partir dela. Sem isto,
  // qualquer usuário logado criaria unidade pendurada na barbearia alheia.
  const { data: vinculo, error: vinculoError } = await admin
    .from('user_salons')
    .select('salon_id')
    .eq('user_id', userId)
    .eq('salon_id', body.salonId)
    .eq('role', 'owner')
    .maybeSingle()

  if (vinculoError) {
    console.error('Erro ao verificar permissão:', vinculoError)
    return json({ error: 'Não foi possível validar sua permissão.' }, 500)
  }
  if (!vinculo) return json({ error: 'Você não é dono desta barbearia.' }, 403)

  const { data: origem, error: origemError } = await admin
    .from('salons')
    .select('id, nome, organization_id, horario_funcionamento')
    .eq('id', body.salonId)
    .single()
  if (origemError || !origem) {
    return json({ error: 'Barbearia de origem não encontrada.' }, 404)
  }

  // ---------- A promoção ----------
  // Origem sem organização = primeira unidade de uma rede que ainda não
  // existe. Cria a organização com o nome da barbearia (o dono renomeia depois
  // se quiser) e anexa a origem. Se a unidade nova falhar mais adiante, a
  // origem fica numa organização de uma unidade só — o que é invisível:
  // `isNetwork` no CRM só liga com duas ou mais.
  let organizationId = origem.organization_id as string | null
  let redeCriada = false

  if (!organizationId) {
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({ nome: origem.nome })
      .select('id')
      .single()
    if (orgError || !org) {
      console.error('Erro ao criar a rede:', orgError)
      return json({ error: 'Não foi possível criar a rede.' }, 500)
    }
    const { error: anexoError } = await admin
      .from('salons')
      .update({ organization_id: org.id })
      .eq('id', origem.id)
    if (anexoError) {
      console.error('Erro ao anexar a origem à rede, desfazendo:', anexoError)
      await admin.from('organizations').delete().eq('id', org.id)
      return json({ error: 'Não foi possível criar a rede.' }, 500)
    }
    organizationId = org.id
    redeCriada = true
  }

  // ---------- A unidade ----------
  // Horário herdado da origem quando não informado: filial costuma abrir no
  // mesmo horário, e sem horário o agente não tem datas para oferecer.
  const { data: novaUnidade, error: salonError } = await admin
    .from('salons')
    .insert({
      nome,
      endereco: body.endereco?.trim() || null,
      telefone: body.telefone?.trim() || null,
      horario_funcionamento: body.horario_funcionamento ?? origem.horario_funcionamento ?? null,
      organization_id: organizationId,
    })
    .select('id, nome')
    .single()

  if (salonError || !novaUnidade) {
    console.error('Erro ao criar unidade:', salonError)
    return json({ error: 'Não foi possível criar a unidade.' }, 500)
  }

  // Daqui em diante qualquer falha desfaz a unidade inteira. A ordem é a
  // inversa da criação; o que o banco apaga por cascata não precisa de linha.
  async function desfazer(motivo: string, erro: unknown) {
    console.error(motivo, erro)
    await admin.from('subscriptions').delete().eq('salon_id', novaUnidade!.id)
    await admin.from('user_salons').delete().eq('salon_id', novaUnidade!.id)
    await admin.from('salons').delete().eq('id', novaUnidade!.id)
  }

  const { error: linkError } = await admin
    .from('user_salons')
    .insert({ user_id: userId, salon_id: novaUnidade.id, role: 'owner' })
  if (linkError) {
    await desfazer('Erro ao vincular dono, desfazendo:', linkError)
    return json({ error: 'Não foi possível criar a unidade.' }, 500)
  }

  // ---------- A assinatura ----------
  // Herda o plano da origem; se a origem (caso raro, cadastro antigo) não
  // tiver assinatura, entra no plano de entrada pelo preço de tabela.
  const { data: assinaturaOrigem } = await admin
    .from('subscriptions')
    .select('plan_codigo, valor')
    .eq('salon_id', origem.id)
    .maybeSingle()

  let planCodigo = assinaturaOrigem?.plan_codigo ?? PLANO_FALLBACK
  let valor = assinaturaOrigem?.valor ?? null
  if (valor == null) {
    const { data: plano } = await admin
      .from('plans')
      .select('codigo, preco_unidade')
      .eq('codigo', planCodigo)
      .maybeSingle()
    planCodigo = plano?.codigo ?? PLANO_FALLBACK
    valor = plano?.preco_unidade ?? null
  }

  const fim = new Date(Date.now() + DIAS_DE_TESTE_DA_UNIDADE * 86400000)
  const { error: assinaturaError } = await admin.from('subscriptions').insert({
    salon_id: novaUnidade.id,
    plan_codigo: planCodigo,
    status: 'trial',
    valor,
    acesso_ate: fim.toISOString().slice(0, 10),
  })
  if (assinaturaError) {
    await desfazer('Erro ao criar a assinatura da unidade, desfazendo:', assinaturaError)
    return json({ error: 'Não foi possível criar a unidade.' }, 500)
  }

  // ---------- O catálogo ----------
  // Extra, não requisito: a unidade já existe e é utilizável. Falha aqui só
  // é registrada.
  let servicosCopiados = 0
  if (body.copiarCatalogo !== false) {
    const { data: servicos } = await admin
      .from('services')
      .select('nome, preco, duracao_minutos, ativo')
      .eq('salon_id', origem.id)

    if (servicos && servicos.length > 0) {
      const { error: copiaError } = await admin
        .from('services')
        .insert(servicos.map((s) => ({ ...s, salon_id: novaUnidade.id })))
      if (copiaError) console.error('Erro ao copiar catálogo:', copiaError)
      else servicosCopiados = servicos.length
    }
  }

  return json({
    salonId: novaUnidade.id,
    nome: novaUnidade.nome,
    organizationId,
    redeCriada,
    servicosCopiados,
  })
})
