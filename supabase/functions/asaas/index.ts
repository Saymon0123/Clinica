import { createClient } from 'jsr:@supabase/supabase-js@2'
import { calcularProporcional } from './proporcional.ts'

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

  // ------------------------------------------------------------------
  // Cobranca da REDE: um boleto para todas as unidades.
  //
  // A cobranca continua nascendo por unidade -- cada `subscriptions` segue
  // sendo a verdade de plano, valor e acesso. O que muda aqui e so o formato
  // do boleto: cancela-se a recorrencia de cada unidade no Asaas e nasce UMA,
  // da rede, no valor da soma. O webhook, ao ver o pagamento dela, estende o
  // acesso de todas as unidades de uma vez.
  //
  // Vive antes do fluxo por unidade porque nao ha `salonId` aqui: a chave e a
  // organizacao.
  // ------------------------------------------------------------------
  if (body.acao === 'assinar-rede' || body.acao === 'separar-rede') {
    const organizationId = body.organizationId as string | undefined
    if (!organizationId) return json({ error: 'Rede nao informada.' }, 400)

    const comoUsuarioRede = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: autorizacao } },
    })

    // Dono de TODAS as unidades, nao de alguma: unificar o boleto mexe na
    // cobranca das outras lojas, e so quem responde por todas pode fazer isso.
    const { data: minhas } = await comoUsuarioRede
      .from('user_salons')
      .select('salon_id, role, salons!inner ( organization_id )')
      .eq('role', 'owner')
      .eq('salons.organization_id', organizationId)

    const adminRede = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: unidades } = await adminRede
      .from('salons')
      .select('id, nome')
      .eq('organization_id', organizationId)

    if (!unidades || unidades.length === 0) return json({ error: 'Rede sem unidades.' }, 404)
    const donaDeTodas =
      (minhas?.length ?? 0) >= unidades.length &&
      unidades.every((u) => minhas?.some((m) => m.salon_id === u.id))
    if (!donaDeTodas) {
      return json({ error: 'Apenas quem e dono de todas as unidades pode mudar a cobranca da rede.' }, 403)
    }

    const { data: org } = await adminRede
      .from('organizations')
      .select('id, nome, cobranca_unificada, cpf_cnpj, asaas_customer_id, asaas_subscription_id')
      .eq('id', organizationId)
      .maybeSingle()
    if (!org) return json({ error: 'Rede nao encontrada.' }, 404)

    if (body.acao === 'separar-rede') {
      if (org.asaas_subscription_id) {
        const r = await asaas(`/subscriptions/${org.asaas_subscription_id}`, { method: 'DELETE' })
        if (!r.ok && r.status !== 404) {
          console.error('Asaas recusou o cancelamento da rede:', r.status, r.data)
          return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel separar agora.' }, 502)
        }
      }
      await adminRede
        .from('organizations')
        .update({ cobranca_unificada: false, asaas_subscription_id: null })
        .eq('id', organizationId)
      // Cada unidade volta a assinar sozinha. `acesso_ate` fica: o que a rede
      // ja pagou continua valendo, mesma regra do cancelamento por unidade.
      await adminRede
        .from('subscriptions')
        .update({ status: 'cancelada', asaas_subscription_id: null })
        .in('salon_id', unidades.map((u) => u.id))
      return json({ separada: true })
    }

    // ---------- assinar-rede ----------
    const { data: assinaturas } = await adminRede
      .from('subscriptions')
      .select('salon_id, valor, asaas_subscription_id')
      .in('salon_id', unidades.map((u) => u.id))

    if (!assinaturas || assinaturas.length < unidades.length) {
      return json({ error: 'Ha unidade sem plano registrado. Abra a Assinatura dela primeiro.' }, 400)
    }
    if (assinaturas.some((a) => a.valor == null)) {
      return json({ error: 'Ha unidade sem valor de plano definido. Avise o suporte.' }, 400)
    }
    // A soma dos valores POR UNIDADE. Quando o modelo de preco mudar, muda em
    // `subscriptions.valor` -- e esta soma acompanha sem tocar aqui.
    const total = assinaturas.reduce((acc, a) => acc + Number(a.valor), 0)

    const cpfCnpj = ((body.cpfCnpj as string | undefined)?.trim() || org.cpf_cnpj) ?? null
    if (!cpfCnpj) return json({ error: 'Informe o CPF ou CNPJ do pagante da rede.' }, 400)

    try {
      let customerId = org.asaas_customer_id
      if (!customerId) {
        const r = await asaas('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: org.nome,
            cpfCnpj,
            externalReference: `rede:${organizationId}`,
          }),
        })
        if (!r.ok) {
          console.error('Asaas recusou o cliente da rede:', r.status, r.data)
          return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel criar o cadastro da rede.' }, 400)
        }
        customerId = r.data.id
      }
      await adminRede
        .from('organizations')
        .update({ asaas_customer_id: customerId, cpf_cnpj: cpfCnpj })
        .eq('id', organizationId)

      // As recorrencias por unidade caem ANTES de a da rede nascer -- a ordem
      // inversa deixaria uma janela em que as duas cobram ao mesmo tempo.
      for (const a of assinaturas) {
        if (!a.asaas_subscription_id) continue
        const r = await asaas(`/subscriptions/${a.asaas_subscription_id}`, { method: 'DELETE' })
        if (!r.ok && r.status !== 404) {
          console.error('Asaas recusou cancelar a unidade', a.salon_id, r.status, r.data)
          return json(
            { error: 'Nao foi possivel cancelar a cobranca de uma unidade. Nada foi unificado.' },
            502,
          )
        }
        await adminRede
          .from('subscriptions')
          .update({ asaas_subscription_id: null })
          .eq('salon_id', a.salon_id)
      }

      let subscriptionId = org.asaas_subscription_id
      if (!subscriptionId) {
        const vencimento = new Date()
        vencimento.setDate(vencimento.getDate() + 3)
        const r = await asaas('/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            customer: customerId,
            billingType: 'UNDEFINED',
            value: total,
            nextDueDate: vencimento.toISOString().slice(0, 10),
            cycle: 'MONTHLY',
            description: `Club Cut - rede ${org.nome} (${unidades.length} unidades)`,
            externalReference: `rede:${organizationId}`,
          }),
        })
        if (!r.ok) {
          console.error('Asaas recusou a assinatura da rede:', r.status, r.data)
          return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel criar a cobranca da rede.' }, 400)
        }
        subscriptionId = r.data.id
      }

      await adminRede
        .from('organizations')
        .update({ cobranca_unificada: true, asaas_subscription_id: subscriptionId })
        .eq('id', organizationId)
      await adminRede
        .from('subscriptions')
        .update({ status: 'pendente' })
        .in('salon_id', unidades.map((u) => u.id))

      const cobrancas = await asaas(`/subscriptions/${subscriptionId}/payments`)
      const lista = (cobrancas.data?.data ?? []) as {
        status: string
        dueDate: string
        value: number
        invoiceUrl: string
      }[]
      const emAberto = lista.find((p) => p.status === 'PENDING' || p.status === 'OVERDUE') ?? lista[0]

      return json({
        unificada: true,
        total,
        unidades: unidades.length,
        invoiceUrl: emAberto?.invoiceUrl ?? null,
        vencimento: emAberto?.dueDate ?? null,
      })
    } catch (err) {
      console.error('Falha ao unificar a cobranca da rede:', err)
      return json({ error: 'Nao foi possivel falar com a operadora de pagamento agora.' }, 502)
    }
  }

  const salonId = body.salonId as string | undefined
  if (!salonId) return json({ error: 'Unidade nao informada.' }, 400)

  const ACOES = ['assinar', 'cancelar', 'simular-troca', 'trocar-plano', 'cancelar-troca'] as const
  type Acao = (typeof ACOES)[number]
  const pedida = body.acao as string
  const acao: Acao = (ACOES as readonly string[]).includes(pedida) ? (pedida as Acao) : 'assinar'

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
    .select(
      'id, plan_codigo, valor, cpf_cnpj, acesso_ate, asaas_customer_id, asaas_subscription_id, plano_agendado, upgrade_payment_id',
    )
    .eq('salon_id', salonId)
    .maybeSingle()

  if (erroAssinatura || !assinatura) {
    console.error('Assinatura nao encontrada para o salao:', salonId, erroAssinatura)
    return json({ error: 'Esta barbearia ainda nao tem um plano registrado.' }, 404)
  }

  // ------------------------------------------------------------------
  // Cancelamento.
  //
  // Cancelar interrompe as **cobranças futuras** e nada mais: `acesso_ate` fica
  // como está, então quem pagou até o dia 20 usa até o dia 20. Foi decidido
  // assim em 2026-08-02 — cortar no ato o que já foi pago seria cobrar por um
  // serviço não entregue.
  //
  // `asaas_subscription_id` é limpo para que reassinar crie uma recorrência
  // nova; o `asaas_customer_id` permanece, porque o cadastro do pagante
  // continua valendo e recriá-lo geraria cliente duplicado no Asaas.
  //
  // A troca agendada também cai: ela descrevia uma renovação que não vai mais
  // acontecer, e sobreviveria como promessa de um plano que ninguém vai cobrar.
  // ------------------------------------------------------------------
  if (acao === 'cancelar') {
    if (assinatura.asaas_subscription_id) {
      const r = await asaas(`/subscriptions/${assinatura.asaas_subscription_id}`, {
        method: 'DELETE',
      })
      // 404 significa que já não existe lá — o efeito desejado, não um erro.
      if (!r.ok && r.status !== 404) {
        console.error('Asaas recusou o cancelamento:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel cancelar agora.' }, 502)
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
      console.error('Erro ao marcar a assinatura como cancelada:', erroUpdate)
      return json({ error: 'Cancelamos no financeiro, mas houve erro ao registrar. Avise o suporte.' }, 500)
    }

    // Fecha a conta na hora: a fatura parcial (ultimo fechamento -> hoje) entra
    // na fila e o e-mail com o detalhamento sai no proximo ciclo do
    // notificador, para o boleto final ser gerado a mao. Falha aqui NAO derruba
    // o cancelamento -- o fechamento mensal do dia 1 cobre o periodo de
    // qualquer forma.
    const { error: erroFatura } = await admin.rpc('gerar_fatura_de_cancelamento', {
      p_salon_id: salonId,
    })
    if (erroFatura) console.error('Erro ao gerar a fatura de cancelamento:', erroFatura)

    return json({ cancelada: true })
  }

  // ------------------------------------------------------------------
  // Desistir da troca agendada.
  //
  // Sem isto, pedir a troca era caminho sem volta: o bloco de mudar de plano
  // virava um aviso estático e o dono não tinha como voltar atrás pelo CRM. É a
  // mesma armadilha do `agent_paused` na aba WEB — ação com ida e sem volta.
  //
  // Desfazer é diferente nos dois sentidos: na descida a recorrência já foi
  // baixada no Asaas e precisa voltar ao valor do plano atual; na subida existe
  // uma cobrança avulsa em aberto, que precisa ser removida para não ficar um
  // Pix cobrável de algo que ninguém mais quer.
  // ------------------------------------------------------------------
  if (acao === 'cancelar-troca') {
    if (!assinatura.plano_agendado) {
      return json({ error: 'Nao ha troca agendada.' }, 400)
    }

    if (assinatura.upgrade_payment_id) {
      const r = await asaas(`/payments/${assinatura.upgrade_payment_id}`, { method: 'DELETE' })
      // 404 = já não existe lá, que é o efeito desejado.
      if (!r.ok && r.status !== 404) {
        console.error('Asaas recusou remover a cobranca da troca:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel desfazer a troca agora.' }, 502)
      }
    } else if (assinatura.asaas_subscription_id) {
      // Devolve a mensalidade ao valor do plano que está valendo hoje.
      const r = await asaas(`/subscriptions/${assinatura.asaas_subscription_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          value: Number(assinatura.valor),
          updatePendingPayments: false,
        }),
      })
      if (!r.ok) {
        console.error('Asaas recusou restaurar o valor da recorrencia:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel desfazer a troca agora.' }, 502)
      }
    }

    const { error: erroDesfazer } = await admin
      .from('subscriptions')
      .update({ plano_agendado: null, upgrade_payment_id: null })
      .eq('id', assinatura.id)

    if (erroDesfazer) {
      console.error('Erro ao desfazer a troca agendada:', erroDesfazer)
      return json({ error: 'Nao foi possivel desfazer a troca agora.' }, 500)
    }

    return json({ desfeita: true })
  }

  // ------------------------------------------------------------------
  // Troca de plano.
  //
  // Regras decididas em 2026-08-02:
  //
  // - **Subir** custa só a diferença proporcional aos dias que faltam, e o
  //   plano novo vale assim que o Pix cair — não no clique. Quem troca o
  //   `plan_codigo` é o webhook, senão bastaria clicar para ter o Pro de graça.
  // - **Descer** não devolve dinheiro: o dono segue no plano atual até o fim do
  //   que pagou e a mudança vale na renovação. Nada é perdido, nada sai do
  //   caixa, e não há estorno a processar.
  //
  // `simular-troca` existe para a tela mostrar o valor **antes** de o dono
  // confirmar. A conta é a mesma nas duas ações, então o que ele vê é o que ele
  // paga — uma segunda conta no front-end divergiria da cobrança.
  // ------------------------------------------------------------------
  if (acao === 'simular-troca' || acao === 'trocar-plano') {
    const destino = body.plano as string | undefined
    if (!destino) return json({ error: 'Informe o plano de destino.' }, 400)
    if (destino === assinatura.plan_codigo) {
      return json({ error: 'Este ja e o seu plano atual.' }, 400)
    }

    const { data: planos } = await admin
      .from('plans')
      .select('codigo, nome, preco_unidade, ativo')
      .in('codigo', [destino, assinatura.plan_codigo])

    const planoDestino = planos?.find((p) => p.codigo === destino)
    if (!planoDestino || !planoDestino.ativo) {
      return json({ error: 'Plano indisponivel.' }, 400)
    }

    const precoDestino = Number(planoDestino.preco_unidade)
    // O preço atual é o `valor` congelado na assinatura, não o de tabela: quem
    // assinou antes de um reajuste paga o que contratou, e a diferença tem de
    // partir desse valor para não cobrar um aumento disfarçado de troca.
    const precoAtual = assinatura.valor != null ? Number(assinatura.valor) : precoDestino
    const conta = calcularProporcional(assinatura.acesso_ate, precoAtual, precoDestino)
    const subida = conta.diferencaMensal > 0

    if (acao === 'simular-troca') {
      return json({
        plano: destino,
        planoNome: planoDestino.nome,
        precoNovo: precoDestino,
        subida,
        ...conta,
        // Sem recorrência não há o que ratear: ninguém pagou nada ainda.
        imediata: !assinatura.asaas_subscription_id || conta.valor === 0,
      })
    }

    // Em teste, ou com a assinatura cancelada, não existe cobrança em curso —
    // trocar é só escolher outro plano, sem dinheiro no meio.
    if (!assinatura.asaas_subscription_id) {
      const { error: erroTroca } = await admin
        .from('subscriptions')
        .update({ plan_codigo: destino, valor: precoDestino, plano_agendado: null })
        .eq('id', assinatura.id)
      if (erroTroca) {
        console.error('Erro ao trocar o plano sem recorrencia:', erroTroca)
        return json({ error: 'Nao foi possivel trocar o plano agora.' }, 500)
      }
      return json({ aplicado: true, plano: destino })
    }

    if (!subida) {
      // Descida: a recorrência passa a cobrar o valor menor já na próxima
      // fatura, mas o `plan_codigo` só muda quando aquele pagamento for
      // confirmado — até lá o dono usa o que pagou.
      const r = await asaas(`/subscriptions/${assinatura.asaas_subscription_id}`, {
        method: 'PUT',
        body: JSON.stringify({ value: precoDestino, updatePendingPayments: false }),
      })
      if (!r.ok) {
        console.error('Asaas recusou a alteracao da recorrencia:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel agendar a troca.' }, 502)
      }

      await admin
        .from('subscriptions')
        .update({ plano_agendado: destino, upgrade_payment_id: null })
        .eq('id', assinatura.id)

      return json({ agendado: true, plano: destino, aplicaEm: assinatura.acesso_ate })
    }

    // Subida com valor abaixo do mínimo do Asaas: liberar sai mais barato que
    // cobrar a mais ou negar o que o dono pediu. São centavos.
    if (conta.valor === 0) {
      const r = await asaas(`/subscriptions/${assinatura.asaas_subscription_id}`, {
        method: 'PUT',
        body: JSON.stringify({ value: precoDestino, updatePendingPayments: false }),
      })
      if (!r.ok) {
        console.error('Asaas recusou a alteracao da recorrencia:', r.status, r.data)
        return json({ error: erroDoAsaas(r.data) ?? 'Nao foi possivel trocar o plano.' }, 502)
      }
      await admin
        .from('subscriptions')
        .update({ plan_codigo: destino, valor: precoDestino, plano_agendado: null })
        .eq('id', assinatura.id)
      return json({ aplicado: true, plano: destino, dispensado: true })
    }

    // Cobrança avulsa da diferença. **Fora** da assinatura de propósito: somar
    // ao ciclo mudaria a mensalidade recorrente, e isto é cobrança de uma vez.
    const cobranca = await asaas('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: assinatura.asaas_customer_id,
        // `UNDEFINED` pelo mesmo motivo da assinatura: forcar Pix so funciona
        // se a conta do Asaas tiver chave Pix liberada, e a nossa nao tinha --
        // a cobranca da diferenca era recusada e a troca de plano morria em
        // 502. Aberta, a fatura oferece Pix, boleto e cartao, e quem paga
        // escolhe. O caminho nao depende mais da aprovacao do Pix.
        billingType: 'UNDEFINED',
        value: conta.valor,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        description: `Troca para o plano ${planoDestino.nome} (${conta.diasRestantes} dias)`,
        externalReference: salonId,
      }),
    })
    if (!cobranca.ok) {
      console.error('Asaas recusou a cobranca da diferenca:', cobranca.status, cobranca.data)
      return json({ error: erroDoAsaas(cobranca.data) ?? 'Nao foi possivel gerar a cobranca.' }, 502)
    }

    // A recorrência **não** muda aqui: se o dono desistir e não pagar, a
    // mensalidade dele tem de continuar sendo a do plano atual. Quem sobe o
    // valor recorrente é o webhook, junto com o plano.
    const { error: erroPendente } = await admin
      .from('subscriptions')
      .update({ plano_agendado: destino, upgrade_payment_id: cobranca.data.id })
      .eq('id', assinatura.id)

    if (erroPendente) {
      console.error('Erro ao registrar a troca pendente:', erroPendente)
      return json({ error: 'Cobranca gerada, mas houve erro ao registrar. Avise o suporte.' }, 500)
    }

    return json({
      invoiceUrl: cobranca.data.invoiceUrl,
      vencimento: cobranca.data.dueDate,
      valor: conta.valor,
      plano: destino,
      diasRestantes: conta.diasRestantes,
    })
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
    //
    // O status vai para `pendente`: assinou, falta o pagamento cair. Sem esse
    // estado — que só passou a existir na 0034 — quem cancelava e assinava de
    // novo ficava marcado como `cancelada` **com recorrência ativa**, e nenhuma
    // tela conseguia descrever isso sem mentir. Quem sai de `pendente` é o
    // webhook, na confirmação.
    let subscriptionId = assinatura.asaas_subscription_id
    if (!subscriptionId) {
      const vencimento = new Date()
      vencimento.setDate(vencimento.getDate() + 3)

      const r = await asaas('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          // `UNDEFINED` deixa a forma de pagamento aberta na fatura — Pix,
          // boleto ou cartão, quem paga escolhe.
          //
          // Não é preferência: em 2026-08-09 a conta de produção recusou
          // `PIX` aqui com `invalid_billingType` ("A forma de pagamento não é
          // permitida para assinaturas"), enquanto o sandbox aceitava.
          //
          // A causa comum das duas recusas — esta e a da cobrança avulsa da
          // troca de plano — é a conta não ter chave Pix liberada. Nenhuma
          // chamada nossa fixa forma de pagamento: quem escolhe é quem paga.
          billingType: 'UNDEFINED',
          value: Number(assinatura.valor),
          nextDueDate: vencimento.toISOString().slice(0, 10),
          cycle: 'MONTHLY',
          // Vira a descricao da cobranca na fatura do Asaas -- o unico lugar
          // onde o nome do produto aparece num documento financeiro que o
          // cliente pagante le. Assinatura ja criada mantem a descricao
          // antiga: o Asaas nao reescreve recorrencia existente.
          description: `Club Cut - plano ${assinatura.plan_codigo}`,
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
        .update({ asaas_subscription_id: subscriptionId, status: 'pendente' })
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
