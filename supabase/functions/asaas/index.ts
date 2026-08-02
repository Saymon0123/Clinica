import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com'

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

async function asaas(caminho: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE_URL}/v3${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY!,
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** Primeira mensagem de erro do Asaas, que vem numa lista. */
function erroDoAsaas(data: unknown): string | null {
  const erros = (data as { errors?: { description?: string }[] })?.errors
  return erros?.[0]?.description ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!ASAAS_API_KEY) {
    console.error('ASAAS_API_KEY ausente nos secrets da function.')
    return json({ error: 'Cobranca nao configurada. Avise o suporte.' }, 500)
  }

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return json({ error: 'Nao autorizado.' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido.' }, 400)
  }

  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Unidade nao informada.' }, 400)

  // ------------------------------------------------------------------
  // Autorização.
  //
  // Abaixo esta função usa `service_role`, que **ignora RLS** — então a
  // proteção do banco não vale aqui e a checagem precisa ser explícita. Um
  // cliente com o token de outro usuário poderia assinar pela barbearia alheia.
  //
  // A verificação usa o JWT de quem chamou (não o service role), justamente
  // para que o RLS de `user_salons` responda pela identidade real.
  // ------------------------------------------------------------------
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: vinculo, error: erroVinculo } = await comoUsuario
    .from('user_salons')
    .select('role')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (erroVinculo) {
    console.error('Erro ao verificar o vinculo:', erroVinculo)
    return json({ error: 'Nao foi possivel verificar sua permissao.' }, 500)
  }
  if (!vinculo || !['owner', 'gerente'].includes(vinculo.role)) {
    return json({ error: 'Apenas dono ou gerente pode assinar.' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: assinatura, error: erroAssinatura } = await admin
    .from('subscriptions')
    .select('id, plan_codigo, valor, cpf_cnpj, asaas_customer_id, asaas_subscription_id')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (erroAssinatura || !assinatura) {
    console.error('Assinatura nao encontrada para o salao:', salonId, erroAssinatura)
    return json({ error: 'Esta barbearia ainda nao tem um plano registrado.' }, 404)
  }

  if (!assinatura.cpf_cnpj) {
    return json({ error: 'Informe o CPF ou CNPJ antes de assinar.' }, 400)
  }

  const { data: salao } = await admin
    .from('salons')
    .select('nome, telefone')
    .eq('id', salonId)
    .maybeSingle()

  try {
    // 1. Cliente no Asaas. Reaproveita quando já existe — criar de novo geraria
    //    cadastro duplicado a cada tentativa de assinar.
    let customerId = assinatura.asaas_customer_id
    if (!customerId) {
      const r = await asaas('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: salao?.nome ?? 'Barbearia',
          cpfCnpj: assinatura.cpf_cnpj,
          mobilePhone: salao?.telefone ?? undefined,
          // Amarra o registro do Asaas ao salão: é por aqui que se descobre de
          // quem é uma cobrança olhando só o painel deles.
          externalReference: salonId,
        }),
      })
      if (!r.ok) {
        console.error('Asaas recusou a criacao do cliente:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel criar o cadastro de cobranca.' }, 400)
      }
      customerId = r.data.id
      await admin.from('subscriptions').update({ asaas_customer_id: customerId }).eq('id', assinatura.id)
    }

    // 2. Assinatura mensal. Idem: só cria se ainda não existir.
    let subscriptionId = assinatura.asaas_subscription_id
    if (!subscriptionId) {
      const vencimento = new Date()
      vencimento.setDate(vencimento.getDate() + 3)

      const r = await asaas('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: 'PIX',
          value: Number(assinatura.valor),
          nextDueDate: vencimento.toISOString().slice(0, 10),
          cycle: 'MONTHLY',
          description: `CRM Salao - plano ${assinatura.plan_codigo}`,
          externalReference: salonId,
        }),
      })
      if (!r.ok) {
        console.error('Asaas recusou a criacao da assinatura:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel criar a assinatura.' }, 400)
      }
      subscriptionId = r.data.id
      await admin
        .from('subscriptions')
        .update({ asaas_subscription_id: subscriptionId })
        .eq('id', assinatura.id)
    }

    // 3. O link de pagamento **não vem** na resposta da assinatura: as cobranças
    //    são geradas por ciclo, e a fatura mora na cobrança. Confirmado testando
    //    a API em 2026-08-02.
    const cobrancas = await asaas(`/subscriptions/${subscriptionId}/payments`)
    if (!cobrancas.ok) {
      console.error('Nao foi possivel listar as cobrancas:', cobrancas.status, cobrancas.data)
      return json({ error: 'Assinatura criada, mas a fatura ainda nao esta disponivel. Tente em instantes.' }, 502)
    }

    const lista = (cobrancas.data.data ?? []) as {
      id: string
      status: string
      dueDate: string
      value: number
      invoiceUrl: string
    }[]

    const emAberto =
      lista.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE') ?? lista[0]

    if (!emAberto) {
      return json({ error: 'Assinatura criada, mas nenhuma cobranca foi gerada ainda.' }, 502)
    }

    return json({
      invoiceUrl: emAberto.invoiceUrl,
      vencimento: emAberto.dueDate,
      valor: emAberto.value,
    })
  } catch (err) {
    console.error('Falha ao falar com o Asaas:', err)
    return json({ error: 'Nao foi possivel falar com a operadora de pagamento agora.' }, 502)
  }
})
