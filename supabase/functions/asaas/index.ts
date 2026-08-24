import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * O que sobrou da integração com o Asaas depois do modelo por uso (2026-08-24).
 *
 * A cobrança passou a ser por agendamento, fechada pelo banco (0097) e faturada
 * **à mão** a partir do e-mail de detalhamento. Não existe mais assinar, trocar
 * de plano nem recorrência criada pelo sistema — caíram as ações `assinar`,
 * `simular-troca`, `trocar-plano`, `cancelar-troca`, `assinar-rede` e o módulo
 * `proporcional`. O histórico delas está no git (até a v23 desta função).
 *
 * Fica:
 *
 * - **cancelar** — o único botão que o cliente tem. Encerra recorrência antiga
 *   no Asaas se ainda existir (legado do modelo anterior), marca a assinatura
 *   como cancelada e gera NA HORA a fatura parcial de uso (último fechamento →
 *   hoje), que vira e-mail de detalhamento pelo notificador.
 * - **unificar-rede / separar-rede** — a preferência de boleto único da rede.
 *   Sem chamada ao Asaas para criar nada: o boleto é manual, e a flag existe
 *   para o detalhamento e a emissão tratarem a rede como um pagante só.
 *
 * O webhook (asaas-webhook) continua intacto: é ele que estende `acesso_ate`
 * quando o boleto manual é pago, por `externalReference = salon_id`.
 */

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

/** Remove uma recorrência no Asaas. 404 = já não existe, que é o efeito desejado. */
async function removerRecorrencia(subscriptionId: string): Promise<boolean> {
  if (!ASAAS_API_KEY) return true
  const res = await fetch(`${ASAAS_BASE_URL}/v3/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
  })
  if (!res.ok && res.status !== 404) {
    console.error('Asaas recusou o cancelamento da recorrencia:', res.status, await res.text())
    return false
  }
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return json({ error: 'Nao autorizado.' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  // O JWT de quem chamou responde pela identidade real via RLS — o service_role
  // ignora RLS e não serve para autorizar.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
  })

  // ------------------------------------------------------------------
  // Preferência de boleto da rede: um só, ou um por unidade.
  // Só o dono de TODAS as unidades mexe — o formato do boleto afeta as outras
  // lojas. Aproveita para derrubar recorrências legadas do modelo antigo, se
  // ainda existirem: nada pode continuar cobrando sozinho.
  // ------------------------------------------------------------------
  if (body.acao === 'unificar-rede' || body.acao === 'separar-rede') {
    const organizationId = body.organizationId as string | undefined
    if (!organizationId) return json({ error: 'Rede nao informada.' }, 400)

    const { data: minhas } = await comoUsuario
      .from('user_salons')
      .select('salon_id, role, salons!inner ( organization_id )')
      .eq('role', 'owner')
      .eq('salons.organization_id', organizationId)

    const { data: unidades } = await admin
      .from('salons')
      .select('id')
      .eq('organization_id', organizationId)

    if (!unidades || unidades.length === 0) return json({ error: 'Rede sem unidades.' }, 404)
    const donaDeTodas =
      (minhas?.length ?? 0) >= unidades.length &&
      unidades.every((u) => minhas?.some((m) => m.salon_id === u.id))
    if (!donaDeTodas) {
      return json({ error: 'Apenas quem e dono de todas as unidades pode mudar a cobranca da rede.' }, 403)
    }

    const unificar = body.acao === 'unificar-rede'
    const cpfCnpj = (body.cpfCnpj as string | undefined)?.trim() || null

    const { error: erroOrg } = await admin
      .from('organizations')
      .update({
        cobranca_unificada: unificar,
        ...(cpfCnpj ? { cpf_cnpj: cpfCnpj } : {}),
      })
      .eq('id', organizationId)
    if (erroOrg) {
      console.error('Erro ao gravar a preferencia da rede:', erroOrg)
      return json({ error: 'Nao foi possivel salvar. Tente novamente.' }, 500)
    }

    // Recorrência legada da rede (criada pelo modelo antigo): derruba sempre —
    // ela cobraria por fora do fechamento por uso.
    const { data: org } = await admin
      .from('organizations')
      .select('asaas_subscription_id')
      .eq('id', organizationId)
      .maybeSingle()
    if (org?.asaas_subscription_id) {
      if (await removerRecorrencia(org.asaas_subscription_id)) {
        await admin
          .from('organizations')
          .update({ asaas_subscription_id: null })
          .eq('id', organizationId)
      }
    }

    return json({ ok: true, cobrancaUnificada: unificar })
  }

  // ------------------------------------------------------------------
  // Cancelamento — o único botão do cliente.
  // ------------------------------------------------------------------
  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Unidade nao informada.' }, 400)
  if (body.acao !== 'cancelar') return json({ error: 'Acao desconhecida.' }, 400)

  const { data: vinculo, error: erroVinculo } = await comoUsuario
    .from('user_salons')
    .select('role')
    .eq('salon_id', salonId)
    .maybeSingle()
  if (erroVinculo) {
    console.error('Erro ao verificar o vinculo:', erroVinculo)
    return json({ error: 'Nao foi possivel verificar sua permissao.' }, 500)
  }
  if (!vinculo || vinculo.role !== 'owner') {
    return json({ error: 'Apenas o dono pode cancelar.' }, 403)
  }

  const { data: assinatura } = await admin
    .from('subscriptions')
    .select('id, asaas_subscription_id')
    .eq('salon_id', salonId)
    .maybeSingle()
  if (!assinatura) {
    return json({ error: 'Esta barbearia nao tem registro de uso.' }, 404)
  }

  // Recorrência legada do modelo antigo, se ainda existir. Falha aqui ABORTA:
  // marcar como cancelada com uma recorrência viva no Asaas seguiria cobrando.
  if (assinatura.asaas_subscription_id) {
    if (!(await removerRecorrencia(assinatura.asaas_subscription_id))) {
      return json({ error: 'Nao foi possivel cancelar agora. Tente novamente.' }, 502)
    }
  }

  const { error: erroUpdate } = await admin
    .from('subscriptions')
    .update({
      status: 'cancelada',
      asaas_subscription_id: null,
      plano_agendado: null,
      upgrade_payment_id: null,
    })
    .eq('id', assinatura.id)
  if (erroUpdate) {
    console.error('Erro ao marcar como cancelada:', erroUpdate)
    return json({ error: 'Houve erro ao registrar o cancelamento. Avise o suporte.' }, 500)
  }

  // Fecha a conta na hora: a fatura parcial (último fechamento → hoje) entra na
  // fila e vira e-mail de detalhamento, para o boleto final ser gerado à mão.
  // Falha aqui NÃO derruba o cancelamento — o fechamento mensal cobre o período.
  const { error: erroFatura } = await admin.rpc('gerar_fatura_de_cancelamento', {
    p_salon_id: salonId,
  })
  if (erroFatura) console.error('Erro ao gerar a fatura de cancelamento:', erroFatura)

  return json({ cancelada: true })
})
