import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_TOOL_SECRET = Deno.env.get('ADMIN_TOOL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://clinica-crm-kappa.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function generateTempPassword() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 14)
}

type Unidade = {
  nome?: string
  endereco?: string
  telefone?: string
  horario_funcionamento?: unknown
  /**
   * Se o dono também atende como barbeiro nesta unidade.
   *
   * Ser dono (acesso, em `user_salons`) e atender (recurso agendável, em
   * `professionals`) são coisas diferentes. Antes esta função criava o dono
   * como profissional em toda unidade, então o dono de rede virava opção de
   * agendamento em todas elas — e o agente de IA passava a oferecê-lo ao
   * cliente no WhatsApp.
   *
   * Ausente = true, para não quebrar chamadas antigas.
   */
  dono_atende?: boolean
}

type Servico = { nome?: string; preco?: number; duracao_minutos?: number }

/** Mesmas chaves usadas em `salons.horario_funcionamento`. */
const DIA_DA_SEMANA: Record<string, number> = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
}

/**
 * Deriva a jornada do barbeiro do horário de funcionamento da unidade.
 *
 * O contrato do n8n diz que barbeiro **sem** linha em `professional_schedules`
 * cai no horário do salão — então a ausência não quebrava nada enquanto a
 * barbearia tivesse um profissional só. Mas o dono abria a aba Equipe e via a
 * jornada em branco, sem saber que existia um padrão implícito; e ao contratar
 * o segundo barbeiro, os dois herdavam o mesmo horário sem que ninguém tivesse
 * escolhido isso.
 *
 * Gravar explicitamente torna o padrão visível e editável desde o primeiro dia.
 * Em troca, mudar o horário do salão depois **não** arrasta a jornada de quem
 * já existe — o que é o comportamento certo assim que houver mais de um
 * barbeiro, já que aí eles divergem de propósito.
 */
function jornadaDoHorario(horario: unknown, professionalId: string) {
  const json = (horario ?? null) as Record<string, { abre?: string; fecha?: string } | null> | null
  if (!json) return []

  return Object.entries(json)
    .flatMap(([chave, faixa]) => {
      const dia = DIA_DA_SEMANA[chave]
      if (dia === undefined || !faixa?.abre || !faixa?.fecha) return []
      return [
        {
          professional_id: professionalId,
          dia_semana: dia,
          hora_inicio: faixa.abre,
          hora_fim: faixa.fecha,
          ativo: true,
        },
      ]
    })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!ADMIN_TOOL_SECRET) {
    return json({ error: 'Ferramenta não configurada (ADMIN_TOOL_SECRET ausente).' }, 500)
  }
  if (req.headers.get('x-admin-secret') !== ADMIN_TOOL_SECRET) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const action = (body.action as string) ?? 'create'

  // Só valida a senha administrativa (tela de acesso).
  if (action === 'verify') {
    return json({ ok: true })
  }

  // ----------------------------------------------------------------
  // Lista as barbearias para o painel administrativo.
  // ----------------------------------------------------------------
  if (action === 'list') {
    const { data: salons, error } = await admin
      .from('salons')
      .select('id, nome, endereco, telefone, ativo, created_at, organization_id, organizations(nome)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao listar barbearias:', error)
      return json({ error: 'Não foi possível carregar as barbearias.' }, 500)
    }

    const ids = (salons ?? []).map((s) => s.id)
    const [{ data: conexoes }, { data: vinculos }, { data: agendamentos }] = await Promise.all([
      admin.from('whatsapp_connections').select('salon_id, status').in('salon_id', ids),
      admin.from('user_salons').select('salon_id, role').in('salon_id', ids),
      admin
        .from('appointments')
        .select('salon_id')
        .in('salon_id', ids)
        .gte('data_hora_inicio', new Date(Date.now() - 30 * 86400000).toISOString()),
    ])

    const enriched = (salons ?? []).map((s) => ({
      ...s,
      rede: (s.organizations as { nome?: string } | null)?.nome ?? null,
      whatsapp: conexoes?.find((c) => c.salon_id === s.id)?.status ?? 'close',
      equipe: vinculos?.filter((v) => v.salon_id === s.id).length ?? 0,
      agendamentos30d: agendamentos?.filter((a) => a.salon_id === s.id).length ?? 0,
    }))

    return json({ salons: enriched })
  }

  // ----------------------------------------------------------------
  // Edita dados básicos de uma unidade.
  // ----------------------------------------------------------------
  if (action === 'update_salon') {
    const { salonId, nome, endereco, telefone } = body as Record<string, string>
    if (!salonId) return json({ error: 'Unidade não informada.' }, 400)

    const { error } = await admin
      .from('salons')
      .update({
        ...(nome ? { nome: nome.trim() } : {}),
        ...(endereco !== undefined ? { endereco: endereco?.trim() || null } : {}),
        ...(telefone !== undefined ? { telefone: telefone?.trim() || null } : {}),
      })
      .eq('id', salonId)

    if (error) {
      console.error('Erro ao atualizar barbearia:', error)
      return json({ error: 'Não foi possível salvar as alterações.' }, 500)
    }
    return json({ ok: true })
  }

  // ----------------------------------------------------------------
  // Ativa/desativa uma unidade (corta o acesso sem apagar histórico).
  // ----------------------------------------------------------------
  if (action === 'toggle_salon') {
    const { salonId, ativo } = body as { salonId?: string; ativo?: boolean }
    if (!salonId || typeof ativo !== 'boolean') {
      return json({ error: 'Dados incompletos.' }, 400)
    }
    const { error } = await admin.from('salons').update({ ativo }).eq('id', salonId)
    if (error) {
      console.error('Erro ao alterar status:', error)
      return json({ error: 'Não foi possível alterar o status.' }, 500)
    }
    return json({ ok: true })
  }

  // ----------------------------------------------------------------
  // Cadastro completo: rede (opcional) + unidades + dono + catálogo.
  // ----------------------------------------------------------------
  if (action !== 'create') {
    return json({ error: 'Ação inválida.' }, 400)
  }

  const tipo = (body.tipo as string) === 'rede' ? 'rede' : 'unica'
  const organizacao = body.organizacao as { nome?: string; cnpj?: string } | undefined
  const dono = body.dono as
    | { nome?: string; email?: string; telefone?: string; comissao_percentual?: number | null }
    | undefined
  const unidades = (body.unidades as Unidade[]) ?? []
  const servicos = (body.servicos as Servico[]) ?? []

  const ownerNome = dono?.nome?.trim()
  const ownerEmail = dono?.email?.trim().toLowerCase()
  const ownerTelefone = dono?.telefone?.trim() || null

  // Comissão nula é o padrão do banco, e era o que a barbearia herdava: o dono
  // atendia e o Financeiro dele mostrava zero, sem pista da causa. Só grava
  // valor válido — número fora de 0–100 vira nulo em vez de sujar o cadastro.
  const bruta = dono?.comissao_percentual
  const ownerComissao =
    typeof bruta === 'number' && Number.isFinite(bruta) && bruta >= 0 && bruta <= 100
      ? bruta
      : null

  if (!ownerNome || !ownerEmail) {
    return json({ error: 'Nome e e-mail do dono são obrigatórios.' }, 400)
  }
  if (unidades.length === 0 || unidades.some((u) => !u.nome?.trim())) {
    return json({ error: 'Informe ao menos uma unidade com nome.' }, 400)
  }
  if (unidades.some((u) => !u.endereco?.trim())) {
    return json({ error: 'O endereço é obrigatório em todas as unidades.' }, 400)
  }
  if (tipo === 'rede' && !organizacao?.nome?.trim()) {
    return json({ error: 'Informe o nome da rede.' }, 400)
  }

  // E-mail já usado?
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return json({ error: 'Erro ao verificar e-mail existente.' }, 500)
  }
  if (existingUsers.users.some((u) => u.email?.toLowerCase() === ownerEmail)) {
    return json({ error: 'Já existe uma conta com esse e-mail.' }, 409)
  }

  // Tudo o que for criado entra aqui, para desfazer em caso de falha.
  let userId: string | null = null
  let organizationId: string | null = null
  const salonIds: string[] = []

  async function rollback() {
    if (salonIds.length) await admin.from('salons').delete().in('id', salonIds)
    if (organizationId) await admin.from('organizations').delete().eq('id', organizationId)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }

  try {
    // 1. Rede, quando houver
    if (tipo === 'rede') {
      const { data: org, error: orgError } = await admin
        .from('organizations')
        .insert({ nome: organizacao!.nome!.trim(), cnpj: organizacao?.cnpj?.trim() || null })
        .select('id')
        .single()
      if (orgError || !org) throw orgError ?? new Error('Falha ao criar a rede.')
      organizationId = org.id
    }

    // 2. Conta do dono
    const tempPassword = generateTempPassword()
    const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
    })
    if (createUserError || !userData.user) {
      throw createUserError ?? new Error('Falha ao criar a conta do dono.')
    }
    userId = userData.user.id

    // 3. Cada unidade: salão + vínculo de dono + ficha do profissional + catálogo
    const criadas: { id: string; nome: string }[] = []

    for (const unidade of unidades) {
      const { data: salon, error: salonError } = await admin
        .from('salons')
        .insert({
          nome: unidade.nome!.trim(),
          endereco: unidade.endereco!.trim(),
          telefone: unidade.telefone?.trim() || ownerTelefone,
          horario_funcionamento: unidade.horario_funcionamento ?? null,
          organization_id: organizationId,
        })
        .select('id, nome')
        .single()
      if (salonError || !salon) throw salonError ?? new Error('Falha ao criar a unidade.')
      salonIds.push(salon.id)
      criadas.push({ id: salon.id, nome: salon.nome })

      const { error: vinculoError } = await admin
        .from('user_salons')
        .insert({ user_id: userId, salon_id: salon.id, role: 'owner' })
      if (vinculoError) throw vinculoError

      // `profiles` foi removida do banco (migration remove_profiles). A fonte
      // de verdade do vínculo usuário↔salão é `user_salons`, inserida acima.

      // O dono só vira profissional quando ele de fato atende nesta unidade.
      const donoAtende = unidade.dono_atende !== false
      if (donoAtende) {
        const { data: profCriado, error: profissionalError } = await admin
          .from('professionals')
          .insert({
            salon_id: salon.id,
            user_id: userId,
            nome: ownerNome,
            telefone: ownerTelefone,
            ativo: true,
            comissao_percentual: ownerComissao,
          })
          .select('id')
          .single()
        if (profissionalError) throw profissionalError

        const jornada = jornadaDoHorario(unidade.horario_funcionamento, profCriado.id)
        if (jornada.length) {
          const { error: jornadaError } = await admin.from('professional_schedules').insert(jornada)
          if (jornadaError) throw jornadaError
        }
      }

      // Catálogo inicial — é o que evita a barbearia nascer vazia.
      const validos = servicos.filter((s) => s.nome?.trim() && Number(s.preco) > 0)
      if (validos.length) {
        const { data: criados, error: servicoError } = await admin
          .from('services')
          .insert(
            validos.map((s) => ({
              salon_id: salon.id,
              nome: s.nome!.trim(),
              preco: Number(s.preco),
              duracao_minutos: Number(s.duracao_minutos) || 30,
              ativo: true,
            })),
          )
          .select('id')
        if (servicoError) throw servicoError

        // Liga os serviços ao dono quando ele atende, senão ele não apareceria
        // como executante na hora de agendar. Quando não atende, não existe
        // profissional aqui e o vínculo é simplesmente pulado — a unidade nasce
        // sem agenda até a equipe ser convidada.
        const { data: prof } = await admin
          .from('professionals')
          .select('id')
          .eq('salon_id', salon.id)
          .eq('user_id', userId)
          .maybeSingle()

        if (prof && criados?.length) {
          await admin
            .from('professional_services')
            .insert(criados.map((s) => ({ professional_id: prof.id, service_id: s.id })))
        }
      }
    }

    return json({
      email: ownerEmail,
      tempPassword,
      loginUrl: APP_URL,
      rede: organizacao?.nome?.trim() ?? null,
      salons: criadas,
    })
  } catch (err) {
    console.error('Erro no cadastro, desfazendo tudo:', err)
    await rollback()
    return json(
      { error: 'Não foi possível concluir o cadastro. Nada foi salvo, pode tentar novamente.' },
      500,
    )
  }
})
