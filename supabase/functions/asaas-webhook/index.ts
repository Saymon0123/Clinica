import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Mesmo valor cadastrado em "Token de autenticação" no painel de webhooks do
// Asaas. Sem ele qualquer um poderia marcar assinaturas como pagas.
const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Eventos do Asaas que mudam o acesso do cliente. */
function statusPara(evento: string): 'ativa' | 'atrasada' | 'cancelada' | null {
  switch (evento) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_RECEIVED_IN_CASH':
      return 'ativa'
    case 'PAYMENT_OVERDUE':
    case 'PAYMENT_DUNNING_REQUESTED':
      return 'atrasada'
    case 'PAYMENT_DELETED':
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      return 'cancelada'
    default:
      return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  if (!ASAAS_WEBHOOK_TOKEN) {
    console.error('ASAAS_WEBHOOK_TOKEN não configurado: webhook recusado.')
    return json({ error: 'Webhook não configurado.' }, 500)
  }
  if (req.headers.get('asaas-access-token') !== ASAAS_WEBHOOK_TOKEN) {
    return json({ error: 'Token inválido.' }, 401)
  }

  let body: {
    event?: string
    payment?: {
      subscription?: string
      externalReference?: string
      dueDate?: string
    }
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }

  const evento = body.event ?? ''
  const novoStatus = statusPara(evento)
  // Evento que não muda acesso (ex: PAYMENT_CREATED) é aceito e ignorado —
  // devolver erro faria o Asaas ficar reenviando.
  if (!novoStatus) return json({ ok: true, ignorado: evento })

  const assinaturaAsaas = body.payment?.subscription
  const salonId = body.payment?.externalReference
  if (!assinaturaAsaas && !salonId) {
    return json({ ok: true, ignorado: 'sem referência de assinatura' })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const alteracao: Record<string, unknown> = {
    status: novoStatus,
    updated_at: new Date().toISOString(),
  }
  if (novoStatus === 'ativa' && body.payment?.dueDate) {
    alteracao.proximo_vencimento = body.payment.dueDate
  }

  const consulta = admin.from('subscriptions').update(alteracao)
  const { error } = assinaturaAsaas
    ? await consulta.eq('asaas_subscription_id', assinaturaAsaas)
    : await consulta.eq('salon_id', salonId as string)

  if (error) {
    console.error('Erro ao atualizar assinatura pelo webhook:', error)
    // 500 faz o Asaas tentar de novo, que é o desejado aqui.
    return json({ error: 'Falha ao registrar o evento.' }, 500)
  }

  return json({ ok: true, evento, status: novoStatus })
})
