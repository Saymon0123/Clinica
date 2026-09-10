import { createClient } from 'jsr:@supabase/supabase-js@2'
import { comSentry } from '../_shared/sentry.ts'

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
const ABACATE_API_KEY = Deno.env.get('ABACATE_API_KEY')
// Sem fallback de propósito: sandbox silencioso em produção é pior que falhar.
const ABACATE_BASE_URL = Deno.env.get('ABACATE_BASE_URL')

/** Abaixo disso não geramos cobrança; o valor acumula para o próximo ciclo. */
const MINIMO_COBRANCA = 5
const DIAS_ATE_O_VENCIMENTO = 7

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

Deno.serve(comSentry('cobrar-uso', async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!chamadorAutorizado(req)) return json({ error: 'Não autorizado.' }, 401)
  if (!ABACATE_API_KEY || !ABACATE_BASE_URL) {
    console.error('ABACATE_API_KEY ou ABACATE_BASE_URL ausente.')
    return json({ error: 'Cobranca nao configurada.' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

    // Cobrança PIX de valor variável (por uso). amount em CENTAVOS; QR válido a
    // janela inteira de 7 dias, casando com cobranca_vence_em (gatilho de bloqueio).
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
      continue
    }

    const { error: erroMarca } = await admin
      .from('faturas_de_uso')
      .update({
        abacate_pix_id: pix.id,
        pix_br_code: pix.brCode ?? null,
        pix_br_code_base64: pix.brCodeBase64 ?? null,
        pix_expira_em: venceEm.toISOString(),
        cobranca_vence_em: venceEmData,
        cobranca_valor: total,
      })
      .in(
        'id',
        grupo.faturas.map((f) => f.id),
      )
    if (erroMarca) {
      // A cobrança existe no AbacatePay mas não ficou registrada. Um PIX que o
      // dono nunca recebe apenas expira sem pagamento — não há cobrança dupla a
      // desfazer. Registra e segue; o próximo ciclo gera outra (idempotência por
      // abacate_pix_id nulo).
      console.error('Erro ao registrar a cobranca PIX (o PIX orfao expira sozinho):', erroMarca, grupo.chave)
      continue
    }

    cobrancas += 1
    faturasCobertas += grupo.faturas.length
  }

  return json({ cobrancas, faturasCobertas, acumuladas, semDocumento })
}))
