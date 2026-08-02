import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

/**
 * Dias que o WhatsApp segue atendendo depois de o acesso ao CRM vencer.
 *
 * Decisão de produto de 2026-08-02: vencer não derruba o atendimento na hora.
 * Cortar o agente pararia o negócio do cliente e viraria reclamação, não
 * pagamento.
 */
const DIAS_DE_TOLERANCIA = 7

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

function somarUmMes(data: string) {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

/** Eventos que abrem o acesso. O resto é ignorado de propósito. */
const PAGOU = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH']

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!WEBHOOK_TOKEN) {
    console.error('ASAAS_WEBHOOK_TOKEN ausente: recusando tudo ate ser configurado.')
    return json({ error: 'nao configurado' }, 500)
  }

  // Sem isto, qualquer um que descubra a URL marca a propria assinatura como
  // paga. O Asaas manda no header o token configurado no painel dele.
  if (req.headers.get('asaas-access-token') !== WEBHOOK_TOKEN) {
    console.warn('Webhook recusado: token invalido.')
    return json({ error: 'nao autorizado' }, 401)
  }

  let corpo: Record<string, unknown> = {}
  try {
    corpo = await req.json()
  } catch {
    // Corpo ilegível não é falha nossa e não adianta reentregar.
    return json({ ok: true, ignorado: 'corpo invalido' })
  }

  const eventoId = corpo.id as string | undefined
  const evento = corpo.event as string | undefined
  const pagamento = corpo.payment as
    | { id?: string; subscription?: string; dueDate?: string; externalReference?: string }
    | undefined

  if (!eventoId || !evento) return json({ ok: true, ignorado: 'sem id ou evento' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ------------------------------------------------------------------
  // Idempotência.
  //
  // A entrega do Asaas é **"at least once"**: o mesmo evento pode chegar mais
  // de uma vez. Sem isto, um PAYMENT_CONFIRMED reentregue empurraria o
  // vencimento de novo e daria dois meses de acesso a quem pagou um.
  //
  // O insert é a trava: a segunda vez falha por chave duplicada, e é essa
  // falha que diz "já tratei".
  // ------------------------------------------------------------------
  const { error: erroRegistro } = await admin.from('asaas_eventos').insert({
    id: eventoId,
    evento,
    payment_id: pagamento?.id ?? null,
    subscription_id: pagamento?.subscription ?? null,
    payload: corpo,
  })

  if (erroRegistro) {
    if (erroRegistro.code === '23505') {
      return json({ ok: true, ignorado: 'evento repetido' })
    }
    // Falha real de banco: devolve erro para o Asaas reentregar depois.
    console.error('Erro ao registrar o evento:', erroRegistro)
    return json({ error: 'erro interno' }, 500)
  }

  try {
    const ehPagamento = PAGOU.includes(evento)
    const ehAtraso = evento === 'PAYMENT_OVERDUE'

    // Todo evento que não muda o acesso sai por aqui com 200. Devolver erro
    // para evento desconhecido é o que faz a fila do Asaas pausar depois de 15
    // falhas seguidas — e aí as confirmações de pagamento param de chegar.
    if (!ehPagamento && !ehAtraso) {
      return json({ ok: true, ignorado: evento })
    }

    // A assinatura é encontrada pelo id do Asaas; o `externalReference` é a
    // rede de segurança para cobrança avulsa, criada fora da assinatura.
    const filtro = pagamento?.subscription
      ? { coluna: 'asaas_subscription_id', valor: pagamento.subscription }
      : { coluna: 'salon_id', valor: pagamento?.externalReference }

    if (!filtro.valor) return json({ ok: true, ignorado: 'sem assinatura no evento' })

    const { data: assinatura } = await admin
      .from('subscriptions')
      .select('id')
      .eq(filtro.coluna, filtro.valor)
      .maybeSingle()

    if (!assinatura) {
      // Cobrança de outra origem, ou salão já removido. Não é erro nosso.
      console.warn('Evento sem assinatura correspondente:', eventoId, filtro)
      return json({ ok: true, ignorado: 'assinatura nao encontrada' })
    }

    if (ehPagamento) {
      // O período pago vai do vencimento até um mês depois. Usar a data de hoje
      // faria quem paga atrasado ganhar o atraso de presente.
      const base = pagamento?.dueDate ?? new Date().toISOString().slice(0, 10)
      const acessoAte = somarUmMes(base)

      await admin
        .from('subscriptions')
        .update({
          status: 'ativa',
          acesso_ate: acessoAte,
          atendimento_ate: somarDias(acessoAte, DIAS_DE_TOLERANCIA),
          proximo_vencimento: acessoAte,
        })
        .eq('id', assinatura.id)

      return json({ ok: true, aplicado: 'acesso liberado', acesso_ate: acessoAte })
    }

    // Atraso não mexe nas datas: o acesso continua valendo até a data já paga,
    // e é ela que decide quando bloquear.
    await admin.from('subscriptions').update({ status: 'atrasada' }).eq('id', assinatura.id)
    return json({ ok: true, aplicado: 'marcado como atrasada' })
  } catch (err) {
    // A trava de idempotência já foi gravada. Se o efeito falhou, ela precisa
    // sair — senão a reentrega do Asaas seria descartada como repetida e o
    // pagamento nunca seria aplicado.
    console.error('Falha ao aplicar o evento, liberando a trava:', err)
    await admin.from('asaas_eventos').delete().eq('id', eventoId)
    return json({ error: 'erro interno' }, 500)
  }
})
