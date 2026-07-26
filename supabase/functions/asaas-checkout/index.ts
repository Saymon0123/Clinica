import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
// sandbox: https://api-sandbox.asaas.com/v3 · produção: https://api.asaas.com/v3
const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL') ?? 'https://api-sandbox.asaas.com/v3'

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

async function asaas(path: string, init: RequestInit = {}) {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY não configurado no projeto Supabase.')
  }
  const res = await fetch(`${ASAAS_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

/** O Asaas devolve os erros em `errors[].description`. */
function motivoDoErro(data: unknown, padrao: string) {
  const erros = (data as { errors?: { description?: string }[] } | null)?.errors
  return erros?.[0]?.description ?? padrao
}

function proximoVencimento() {
  // Primeira cobrança amanhã: dá tempo de o cliente pagar sem vencer no mesmo dia.
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)
  const userId = userData.user.id

  let body: {
    salonId?: string
    plano?: string
    nome?: string
    cpfCnpj?: string
    telefone?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }

  if (!body.salonId) return json({ error: 'Unidade não informada.' }, 400)
  if (body.plano !== 'basico' && body.plano !== 'pro') {
    return json({ error: 'Plano inválido.' }, 400)
  }
  const cpfCnpj = (body.cpfCnpj ?? '').replace(/\D/g, '')
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    return json({ error: 'Informe um CPF ou CNPJ válido.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Só o dono da unidade assina. Gerente administra a operação, não a conta.
  const { data: vinculo, error: vinculoError } = await admin
    .from('user_salons')
    .select('salon_id, salons!inner ( nome, organization_id )')
    .eq('user_id', userId)
    .eq('salon_id', body.salonId)
    .eq('role', 'owner')
    .maybeSingle()

  if (vinculoError) {
    console.error('Erro ao validar permissão:', vinculoError)
    return json({ error: 'Não foi possível validar sua permissão.' }, 500)
  }
  if (!vinculo) return json({ error: 'Você não é dono desta unidade.' }, 403)

  const salao = (vinculo.salons ?? {}) as { nome?: string; organization_id?: string | null }

  // Preço por unidade, com desconto quando a rede tem mais de uma.
  const { data: plano, error: planoError } = await admin
    .from('plans')
    .select('codigo, nome, preco_unidade, preco_unidade_rede')
    .eq('codigo', body.plano)
    .maybeSingle()

  if (planoError || !plano) return json({ error: 'Plano não encontrado.' }, 404)

  let unidadesDaRede = 1
  if (salao.organization_id) {
    const { count } = await admin
      .from('salons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', salao.organization_id)
      .eq('ativo', true)
    unidadesDaRede = count ?? 1
  }
  const valor = Number(
    unidadesDaRede > 1 ? plano.preco_unidade_rede : plano.preco_unidade,
  )

  // Assinatura já existente desta unidade: reaproveita o cliente no Asaas
  // para não duplicar cadastro a cada troca de plano.
  const { data: assinaturaAtual } = await admin
    .from('subscriptions')
    .select('id, asaas_customer_id, asaas_subscription_id')
    .eq('salon_id', body.salonId)
    .maybeSingle()

  try {
    let customerId = assinaturaAtual?.asaas_customer_id ?? null

    if (!customerId) {
      const criarCliente = await asaas('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: body.nome?.trim() || salao.nome || 'Cliente',
          email: userData.user.email,
          cpfCnpj,
          mobilePhone: (body.telefone ?? '').replace(/\D/g, '') || undefined,
          externalReference: body.salonId,
        }),
      })
      if (!criarCliente.ok) {
        console.error('Erro ao criar cliente no Asaas:', criarCliente.status, criarCliente.data)
        return json(
          { error: motivoDoErro(criarCliente.data, 'Não foi possível criar seu cadastro de cobrança.') },
          502,
        )
      }
      customerId = (criarCliente.data as { id?: string }).id ?? null
      if (!customerId) return json({ error: 'Resposta inesperada do Asaas.' }, 502)
    }

    // Trocar de plano não pode deixar duas assinaturas cobrando ao mesmo tempo.
    if (assinaturaAtual?.asaas_subscription_id) {
      await asaas(`/subscriptions/${assinaturaAtual.asaas_subscription_id}`, { method: 'DELETE' })
    }

    const criarAssinatura = await asaas('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        // UNDEFINED deixa o cliente escolher pix, boleto ou cartão no checkout.
        billingType: 'UNDEFINED',
        value: valor,
        nextDueDate: proximoVencimento(),
        cycle: 'MONTHLY',
        description: `Salão CRM — plano ${plano.nome} — ${salao.nome ?? 'unidade'}`,
        externalReference: body.salonId,
      }),
    })

    if (!criarAssinatura.ok) {
      console.error('Erro ao criar assinatura no Asaas:', criarAssinatura.status, criarAssinatura.data)
      return json(
        { error: motivoDoErro(criarAssinatura.data, 'Não foi possível criar a assinatura.') },
        502,
      )
    }

    const assinatura = criarAssinatura.data as { id?: string; nextDueDate?: string }

    // O link de pagamento fica na primeira cobrança gerada pela assinatura.
    let checkoutUrl: string | null = null
    const cobrancas = await asaas(`/subscriptions/${assinatura.id}/payments`)
    if (cobrancas.ok) {
      const lista = (cobrancas.data as { data?: { invoiceUrl?: string }[] }).data ?? []
      checkoutUrl = lista[0]?.invoiceUrl ?? null
    }

    const { error: upsertError } = await admin.from('subscriptions').upsert(
      {
        salon_id: body.salonId,
        plan_codigo: plano.codigo,
        // Só o webhook confirma pagamento. Aqui a assinatura nasce pendente.
        status: 'trial',
        asaas_customer_id: customerId,
        asaas_subscription_id: assinatura.id,
        valor,
        proximo_vencimento: assinatura.nextDueDate ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'salon_id' },
    )

    if (upsertError) {
      console.error('Erro ao gravar assinatura:', upsertError)
      return json({ error: 'Assinatura criada, mas não foi possível salvar no sistema.' }, 500)
    }

    return json({
      checkoutUrl,
      valor,
      unidadesDaRede,
      plano: plano.codigo,
    })
  } catch (err) {
    console.error('Erro no checkout do Asaas:', err)
    return json({ error: 'Não foi possível falar com o Asaas agora.' }, 500)
  }
})
