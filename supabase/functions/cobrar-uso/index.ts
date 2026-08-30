import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Transforma faturas de uso abertas em cobranças no Asaas.
 *
 * Roda pelo n8n a cada hora, ANTES do notificador — assim o e-mail já sai com
 * o link do boleto. É idempotente por desenho: só olha fatura com
 * `asaas_payment_id` nulo e valor > 0, então disparar de novo não cobra ninguém
 * duas vezes. Mesmo assim o gatilho exige a service key (revisão de 29/08):
 * idempotência protege contra cobrança dupla, não contra antecipação forçada
 * nem contra martelar a API do Asaas com um JWT qualquer.
 *
 * Três regras que moram aqui:
 *
 * - **Mínimo do Asaas (R$ 5).** Grupo com total abaixo disso não vira boleto:
 *   as faturas ficam abertas e ACUMULAM — o boleto do mês seguinte cobre todas.
 *   Uma cobrança pode apontar para várias faturas, e é o `asaas_payment_id`
 *   compartilhado que registra isso.
 * - **Rede com boleto único** (`organizations.cobranca_unificada`): as faturas
 *   de todas as unidades entram numa cobrança só, no pagante da rede, com
 *   `externalReference = rede:<orgId>` — que o webhook já entende e usa para
 *   estender todas as unidades de uma vez.
 * - **Sem CPF/CNPJ não há cobrança.** O grupo é pulado e a fatura fica aberta;
 *   o CRM pede o documento na aba Assinatura.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
// Sem fallback de propósito: sandbox silencioso em produção é pior que falhar.
const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL')

/** Abaixo disso o Asaas recusa a cobrança; o valor acumula para o próximo mês. */
const MINIMO_ASAAS = 5
const DIAS_ATE_O_VENCIMENTO = 7

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
 * antecipação forçada nem contra martelar a API do Asaas com JWT qualquer.
 */
function chamadorAutorizado(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const esperado = SERVICE_ROLE_KEY
  if (token.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) diff |= token.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!chamadorAutorizado(req)) return json({ error: 'Não autorizado.' }, 401)
  if (!ASAAS_API_KEY || !ASAAS_BASE_URL) {
    console.error('ASAAS_API_KEY ou ASAAS_BASE_URL ausente.')
    return json({ error: 'Cobranca nao configurada.' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: faturas, error: erroFaturas } = await admin
    .from('faturas_de_uso')
    .select('id, salon_id, periodo_inicio, periodo_fim, valor')
    .is('asaas_payment_id', null)
    .gt('valor', 0)
  if (erroFaturas) {
    console.error('Erro ao listar faturas abertas:', erroFaturas)
    return json({ error: 'erro interno' }, 500)
  }
  if (!faturas || faturas.length === 0) {
    return json({ cobrancas: 0, faturasCobertas: 0, acumuladas: 0, semDocumento: 0 })
  }

  const salonIds = [...new Set(faturas.map((f) => f.salon_id))]
  const [{ data: salons }, { data: subs }] = await Promise.all([
    admin
      .from('salons')
      .select('id, nome, organization_id, organizations ( id, nome, cobranca_unificada, cpf_cnpj, asaas_customer_id )')
      .in('id', salonIds),
    admin.from('subscriptions').select('salon_id, cpf_cnpj, asaas_customer_id').in('salon_id', salonIds),
  ])

  type Org = {
    id: string
    nome: string
    cobranca_unificada: boolean
    cpf_cnpj: string | null
    asaas_customer_id: string | null
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
    if (total < MINIMO_ASAAS) {
      acumuladas += grupo.faturas.length
      continue
    }

    // Pagante: a rede, ou a barbearia.
    let customerId: string | null
    let cpfCnpj: string | null
    let nomePagante: string
    if (grupo.rede) {
      customerId = grupo.rede.asaas_customer_id
      cpfCnpj = grupo.rede.cpf_cnpj
      nomePagante = grupo.rede.nome
    } else {
      const sub = subs?.find((s) => s.salon_id === grupo.salonId)
      customerId = sub?.asaas_customer_id ?? null
      cpfCnpj = sub?.cpf_cnpj ?? null
      nomePagante = salons?.find((s) => s.id === grupo.salonId)?.nome ?? 'Barbearia'
    }

    if (!customerId && !cpfCnpj) {
      // Sem documento não dá para criar o pagante. A fatura fica aberta e o
      // CRM pede o CPF/CNPJ; o próximo ciclo tenta de novo.
      semDocumento += grupo.faturas.length
      continue
    }

    if (!customerId) {
      const r = await asaas('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: nomePagante, cpfCnpj, externalReference: grupo.chave }),
      })
      if (!r.ok) {
        console.error('Asaas recusou o pagante', grupo.chave, r.status, r.data)
        continue
      }
      customerId = r.data.id as string
      if (grupo.rede) {
        await admin.from('organizations').update({ asaas_customer_id: customerId }).eq('id', grupo.rede.id)
      } else {
        await admin
          .from('subscriptions')
          .update({ asaas_customer_id: customerId })
          .eq('salon_id', grupo.salonId!)
      }
    }

    const vencimento = new Date(Date.now() + DIAS_ATE_O_VENCIMENTO * 86400000)
      .toISOString()
      .slice(0, 10)
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

    const cobranca = await asaas('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        // Aberta de propósito: a fatura do Asaas oferece boleto, Pix e cartão,
        // e quem paga escolhe — a mesma razão de sempre.
        billingType: 'UNDEFINED',
        value: total,
        dueDate: vencimento,
        description: descricao,
        // É por esta referência que o webhook estende o acesso — da unidade,
        // ou de TODAS as unidades quando o prefixo é rede:.
        externalReference: grupo.chave,
      }),
    })
    if (!cobranca.ok) {
      console.error('Asaas recusou a cobranca', grupo.chave, cobranca.status, cobranca.data)
      continue
    }

    const { error: erroMarca } = await admin
      .from('faturas_de_uso')
      .update({
        asaas_payment_id: cobranca.data.id,
        boleto_url: cobranca.data.invoiceUrl ?? null,
        boleto_vencimento: vencimento,
        boleto_valor: total,
      })
      .in(
        'id',
        grupo.faturas.map((f) => f.id),
      )
    if (erroMarca) {
      // A cobrança existe no Asaas mas não ficou registrada — remove lá para
      // não cobrar algo que o sistema não sabe que cobrou.
      console.error('Erro ao registrar a cobranca, desfazendo no Asaas:', erroMarca)
      await asaas(`/payments/${cobranca.data.id}`, { method: 'DELETE' })
      continue
    }

    cobrancas += 1
    faturasCobertas += grupo.faturas.length
  }

  return json({ cobrancas, faturasCobertas, acumuladas, semDocumento })
})
