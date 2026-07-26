import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

  // Cliente com o token do usuário: serve só para descobrir quem está chamando.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)
  const userId = userData.user.id

  let body: {
    organizationId?: string
    nome?: string
    endereco?: string
    telefone?: string
    horario_funcionamento?: unknown
    copiarCatalogoDe?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }

  const nome = body.nome?.trim()
  if (!nome) return json({ error: 'Informe o nome da unidade.' }, 400)
  if (!body.organizationId) return json({ error: 'Rede não informada.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Autorização: só quem já é dono de uma unidade DESTA rede pode criar outra.
  // Sem essa checagem qualquer usuário logado poderia inserir unidade em rede alheia.
  const { data: vinculos, error: vinculoError } = await admin
    .from('user_salons')
    .select('salon_id, role, salons!inner ( organization_id )')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('salons.organization_id', body.organizationId)

  if (vinculoError) {
    console.error('Erro ao verificar permissão:', vinculoError)
    return json({ error: 'Não foi possível validar sua permissão.' }, 500)
  }
  if (!vinculos || vinculos.length === 0) {
    return json({ error: 'Você não é dono desta rede.' }, 403)
  }

  const { data: novaUnidade, error: salonError } = await admin
    .from('salons')
    .insert({
      nome,
      endereco: body.endereco?.trim() || null,
      telefone: body.telefone?.trim() || null,
      horario_funcionamento: body.horario_funcionamento ?? null,
      organization_id: body.organizationId,
    })
    .select('id, nome')
    .single()

  if (salonError || !novaUnidade) {
    console.error('Erro ao criar unidade:', salonError)
    return json({ error: 'Não foi possível criar a unidade.' }, 500)
  }

  const { error: linkError } = await admin
    .from('user_salons')
    .insert({ user_id: userId, salon_id: novaUnidade.id, role: 'owner' })

  if (linkError) {
    console.error('Erro ao vincular dono, desfazendo:', linkError)
    await admin.from('salons').delete().eq('id', novaUnidade.id)
    return json({ error: 'Não foi possível criar a unidade.' }, 500)
  }

  // Catálogo opcional: só copia de uma unidade que o chamador realmente possui.
  let servicosCopiados = 0
  if (body.copiarCatalogoDe) {
    const podeCopiar = vinculos.some((v) => v.salon_id === body.copiarCatalogoDe)
    if (podeCopiar) {
      const { data: servicos } = await admin
        .from('services')
        .select('nome, preco, duracao_minutos, ativo')
        .eq('salon_id', body.copiarCatalogoDe)

      if (servicos && servicos.length > 0) {
        const { error: copiaError } = await admin
          .from('services')
          .insert(servicos.map((s) => ({ ...s, salon_id: novaUnidade.id })))
        if (copiaError) {
          // A unidade já existe e é utilizável; o catálogo é um extra.
          console.error('Erro ao copiar catálogo:', copiaError)
        } else {
          servicosCopiados = servicos.length
        }
      }
    }
  }

  return json({ salonId: novaUnidade.id, nome: novaUnidade.nome, servicosCopiados })
})
