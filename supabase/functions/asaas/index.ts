import { createClient } from 'jsr:@supabase/supabase-js@2'
import { capturarErro, comSentry } from '../_shared/sentry.ts'

/**
 * Ações da assinatura que o CRM dispara: cancelar e a preferência de cobrança
 * única da rede.
 *
 * A função ainda se chama `asaas` por compatibilidade com quem a invoca
 * (CancelarUso, CobrancaDaRede), mas **não fala mais com provedor de pagamento
 * nenhum**: a cobrança virou PIX no AbacatePay, criada pelo `cobrar-uso` e
 * confirmada pelo `abacate-webhook`. Sumiram a recorrência e o cliente Asaas —
 * o histórico dessas ações (assinar, trocar de plano etc.) está no git.
 *
 * Fica:
 *
 * - **cancelar** — o único botão do cliente. Marca a assinatura como cancelada e
 *   gera NA HORA a fatura parcial de uso (último fechamento → hoje), que vira
 *   e-mail de detalhamento pelo notificador.
 * - **unificar-rede / separar-rede** — a preferência de cobrança única da rede:
 *   uma cobrança PIX para todas as unidades, ou uma por unidade. É só a flag
 *   `organizations.cobranca_unificada`, que o `cobrar-uso` lê ao gerar o PIX.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

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

Deno.serve(comSentry('asaas', async (req: Request) => {
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

  // Identidade de quem chamou. As checagens de vínculo abaixo PRECISAM filtrar
  // por user_id: a RLS deixa gestor enxergar os vínculos da equipe inteira,
  // então consultar user_salons só por salon_id devolve os vínculos dos outros
  // — o maybeSingle estourava com 2+ pessoas (dono com equipe não conseguia
  // cancelar) e o papel checado podia ser o de um colega.
  const { data: quemChamou } = await comoUsuario.auth.getUser()
  const usuario = quemChamou?.user
  if (!usuario) return json({ error: 'Nao autorizado.' }, 401)

  // ------------------------------------------------------------------
  // Preferência de cobrança da rede: uma só, ou uma por unidade.
  // Só o dono de TODAS as unidades mexe — o formato da cobrança afeta as outras
  // lojas.
  // ------------------------------------------------------------------
  if (body.acao === 'unificar-rede' || body.acao === 'separar-rede') {
    const organizationId = body.organizationId as string | undefined
    if (!organizationId) return json({ error: 'Rede nao informada.' }, 400)

    const { data: minhas } = await comoUsuario
      .from('user_salons')
      .select('salon_id, role, salons!inner ( organization_id )')
      .eq('user_id', usuario.id)
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
      // 23514 aqui e sempre a mesma coisa: ligar a cobranca unica sem CPF/CNPJ
      // valido (CHECK `organizations_unificada_exige_documento`, migration
      // 0130). E pedido do usuario, nao falha do sistema -- 400 com a frase
      // certa, e nao um 500 generico que manda "tentar de novo" para sempre.
      if (erroOrg.code === '23514') {
        return json(
          { error: 'Para receber uma cobranca unica da rede e preciso informar um CPF ou CNPJ valido do pagante.' },
          400,
        )
      }
      console.error('Erro ao gravar a preferencia da rede:', erroOrg)
      return json({ error: 'Nao foi possivel salvar. Tente novamente.' }, 500)
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
    .eq('user_id', usuario.id)
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
    .select('id')
    .eq('salon_id', salonId)
    .maybeSingle()
  if (!assinatura) {
    return json({ error: 'Esta barbearia nao tem registro de uso.' }, 404)
  }

  const { error: erroUpdate } = await admin
    .from('subscriptions')
    .update({ status: 'cancelada' })
    .eq('id', assinatura.id)
  if (erroUpdate) {
    console.error('Erro ao marcar como cancelada:', erroUpdate)
    return json({ error: 'Houve erro ao registrar o cancelamento. Avise o suporte.' }, 500)
  }

  // Fecha a conta na hora: a fatura parcial (último fechamento → hoje) entra na
  // fila e vira e-mail de detalhamento, para a cobrança final ser gerada. Falha
  // aqui NÃO derruba o cancelamento — o fechamento mensal cobre o período.
  const { error: erroFatura } = await admin.rpc('gerar_fatura_de_cancelamento', {
    p_salon_id: salonId,
  })
  if (erroFatura) {
    // Falha silenciosa de dinheiro: o cancelamento segue, mas sem a fatura
    // parcial ninguém cobra o período — precisa aparecer no painel.
    console.error('Erro ao gerar a fatura de cancelamento:', erroFatura)
    await capturarErro(erroFatura, 'asaas', { onde: 'gerar_fatura_de_cancelamento', salonId })
  }

  return json({ cancelada: true })
}))
