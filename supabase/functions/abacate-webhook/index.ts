import { createClient } from 'jsr:@supabase/supabase-js@2'
import { capturarErro, comSentry } from '../_shared/sentry.ts'

/**
 * Recebe os eventos do AbacatePay e libera/reabre o acesso conforme o pagamento.
 *
 * Autenticação em dois caminhos (aceita qualquer um válido, defesa em
 * profundidade): o AbacatePay manda o secret na query (`?webhookSecret=...`, o
 * modo padrão do painel) e/ou uma assinatura HMAC-SHA256 do corpo no header
 * `X-Webhook-Signature`. Sem um deles bater, recusa — é o que impede alguém que
 * descubra a URL de marcar a própria cobrança como paga.
 *
 * Roteio pelo BANCO, não pelo payload: o `cobrar-uso` gravou `abacate_pix_id`
 * na(s) fatura(s) desta cobrança, então achar as faturas por esse id já entrega
 * os salões certos — cobre unidade única, acúmulo e rede unificada de uma vez.
 *
 * Pagar QUITA o ciclo e reabre o acesso na hora; daí o cron
 * `estender_acesso_sem_debito` rege o acesso dia a dia. NÃO compra "+1 mês"
 * (herança do modelo de assinatura, que morreu).
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('ABACATE_WEBHOOK_SECRET')

// Casam com o cron estender_acesso_sem_debito (acesso hoje+1, atendimento hoje+8):
// a mesma linha que o cron produziria, para webhook e cron nunca divergirem.
const ACESSO_DIAS = 1
const ATENDIMENTO_DIAS = 8

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Hoje no fuso de São Paulo — mesma referência do cron de acesso. */
function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Comparação em tempo constante, para o secret não vazar por timing. */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Confere a assinatura HMAC-SHA256 do corpo cru contra o header. */
async function hmacConfere(corpoRaw: string, assinatura: string, secret: string): Promise<boolean> {
  try {
    const chave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoRaw))
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const recebido = assinatura.replace(/^sha256=/i, '').trim().toLowerCase()
    return igualConstante(hex, recebido)
  } catch {
    return false
  }
}

Deno.serve(comSentry('abacate-webhook', async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!WEBHOOK_SECRET) {
    console.error('ABACATE_WEBHOOK_SECRET ausente: recusando tudo ate ser configurado.')
    return json({ error: 'nao configurado' }, 500)
  }

  // Corpo cru primeiro: preciso dele para o HMAC E para o JSON.
  const corpoRaw = await req.text()

  const secretQuery = new URL(req.url).searchParams.get('webhookSecret')
  const assinatura = req.headers.get('x-webhook-signature')
  const queryOk = secretQuery != null && igualConstante(secretQuery, WEBHOOK_SECRET)
  const hmacOk = assinatura != null && (await hmacConfere(corpoRaw, assinatura, WEBHOOK_SECRET))
  if (!queryOk && !hmacOk) {
    console.warn('Webhook recusado: secret/assinatura invalidos.')
    return json({ error: 'nao autorizado' }, 401)
  }

  let corpo: Record<string, unknown> = {}
  try {
    corpo = JSON.parse(corpoRaw)
  } catch {
    // Corpo ilegível não é falha nossa e não adianta reentregar.
    return json({ ok: true, ignorado: 'corpo invalido' })
  }

  const eventoId = corpo.id as string | undefined
  const evento = corpo.event as string | undefined
  const dados = (corpo.data ?? {}) as Record<string, unknown>
  // O objeto da cobranca PIX vem em `data.transparent` (id, status, externalId),
  // nao em `data.id`. Confirmado no payload real do sandbox.
  const transparente = (dados.transparent ?? {}) as { id?: string; externalId?: string }
  const pixId = transparente.id ?? (dados.id as string | undefined) ?? (dados.pixId as string | undefined)

  if (!eventoId || !evento) return json({ ok: true, ignorado: 'sem id ou evento' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Idempotência: a entrega do AbacatePay pode repetir. O insert é a trava — a
  // segunda vez falha por PK duplicada, e é essa falha que diz "já tratei".
  const { error: erroRegistro } = await admin.from('cobranca_eventos').insert({
    id: eventoId,
    evento,
    pix_id: pixId ?? null,
    payload: corpo,
  })
  if (erroRegistro) {
    if (erroRegistro.code === '23505') return json({ ok: true, ignorado: 'evento repetido' })
    console.error('Erro ao registrar o evento:', erroRegistro)
    return json({ error: 'erro interno' }, 500)
  }

  try {
    const ehPago = evento === 'transparent.completed'
    const ehEstorno = evento === 'transparent.refunded'

    // Todo evento que não mexe no acesso sai com 200: devolver erro faria a fila
    // do AbacatePay pausar ao acumular falhas, e as confirmações parariam de vir.
    if (!ehPago && !ehEstorno) return json({ ok: true, ignorado: evento })
    if (!pixId) return json({ ok: true, ignorado: 'evento sem id de cobranca' })

    if (ehPago) {
      // Marca como pagas as faturas cobertas por este PIX (uma cobrança pode
      // cobrir várias: acúmulo e rede). Roteia pelo abacate_pix_id, não pelo payload.
      // `error` PRECISA ser lido. O supabase-js RESOLVE com {data:null, error}
      // em vez de lançar: sem este `throw`, um UPDATE que falha virava
      // `pagas = null` -> `salonIds = []` -> assinatura intocada -> resposta 200
      // -> o catch abaixo nunca rodava -> a trava de idempotência de cima ficava
      // gravada -> a reentrega do AbacatePay era descartada como `23505`.
      // Ou seja: o cliente pagava, o acesso não abria, e não sobrava rastro.
      // Lançar aqui é o que devolve o caso ao catch, que solta a trava e
      // responde 500 — e é o 500 que faz o AbacatePay entregar de novo.
      const agora = new Date().toISOString()
      const { data: pagas, error: erroPagas } = await admin
        .from('faturas_de_uso')
        .update({ paga_em: agora })
        .eq('abacate_pix_id', pixId)
        .is('paga_em', null)
        .select('salon_id')
      if (erroPagas) throw erroPagas

      // Nada casou pelo id atual? Pode ser um PIX que foi REEMITIDO: o dono
      // apertou "Gerar novo Pix", o id antigo foi para `pix_anteriores` — e
      // então pagou o código velho. A dívida é a mesma, e ignorar isso seria o
      // mesmo buraco de sempre: dinheiro entra, acesso não abre.
      let cobertas = pagas ?? []
      if (cobertas.length === 0) {
        const { data: antigas, error: erroAntigas } = await admin
          .from('faturas_de_uso')
          .update({ paga_em: agora })
          .contains('pix_anteriores', [pixId])
          .is('paga_em', null)
          .select('salon_id')
        if (erroAntigas) throw erroAntigas
        cobertas = antigas ?? []
      }

      const salonIds = [...new Set(cobertas.map((f) => f.salon_id))]
      if (salonIds.length > 0) {
        const hoje = hojeSP()
        // `neq('cancelada')` não é detalhe: a fatura de cancelamento existe
        // justamente para quem já cancelou. Sem este filtro, pagar a última
        // conta ressuscitava a assinatura — o cron voltava a estender acesso
        // todo dia e o fechamento mensal voltava a faturar períodos posteriores
        // à saída. Pagar o que se deve não é pedir para voltar.
        const { error: erroAcesso } = await admin
          .from('subscriptions')
          .update({
            status: 'ativa',
            acesso_ate: somarDias(hoje, ACESSO_DIAS),
            atendimento_ate: somarDias(hoje, ATENDIMENTO_DIAS),
          })
          .in('salon_id', salonIds)
          .neq('status', 'cancelada')
        if (erroAcesso) throw erroAcesso
      }
      return json({ ok: true, aplicado: 'pago', faturas: cobertas.length, salons: salonIds.length })
    }

    // Estorno: reabre as faturas; o cron de acesso reavalia (se virar vencida em
    // aberto, bloqueia no próximo passe).
    const { data: reabertas, error: erroReabertas } = await admin
      .from('faturas_de_uso')
      .update({ paga_em: null })
      .eq('abacate_pix_id', pixId)
      .not('paga_em', 'is', null)
      .select('id')
    if (erroReabertas) throw erroReabertas

    // Mesma queda de braço do ramo de pagamento: o estorno pode chegar depois de
    // uma reemissão, referindo-se ao id antigo.
    let desfeitas = reabertas ?? []
    if (desfeitas.length === 0) {
      const { data: antigas, error: erroAntigas } = await admin
        .from('faturas_de_uso')
        .update({ paga_em: null })
        .contains('pix_anteriores', [pixId])
        .not('paga_em', 'is', null)
        .select('id')
      if (erroAntigas) throw erroAntigas
      desfeitas = antigas ?? []
    }
    return json({ ok: true, aplicado: 'estornado', faturas: desfeitas.length })
  } catch (err) {
    // A trava de idempotência já foi gravada. Se o efeito falhou, ela precisa
    // sair — senão a reentrega seria descartada como repetida e o pagamento
    // nunca seria aplicado.
    console.error('Falha ao aplicar o evento, liberando a trava:', err)
    await capturarErro(err, 'abacate-webhook')
    await admin.from('cobranca_eventos').delete().eq('id', eventoId)
    return json({ error: 'erro interno' }, 500)
  }
}))
