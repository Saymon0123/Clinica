import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_TOOL_SECRET = Deno.env.get('ADMIN_TOOL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

  const providedSecret = req.headers.get('x-admin-secret')
  if (providedSecret !== ADMIN_TOOL_SECRET) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  let body: {
    salonName?: string
    ownerName?: string
    ownerEmail?: string
    ownerPhone?: string
    salonPhone?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const salonName = body.salonName?.trim()
  const ownerName = body.ownerName?.trim()
  const ownerEmail = body.ownerEmail?.trim().toLowerCase()
  const ownerPhone = body.ownerPhone?.trim() || null
  const salonPhone = body.salonPhone?.trim() || ownerPhone

  if (!salonName || !ownerName || !ownerEmail) {
    return json({ error: 'Nome da barbearia, nome do dono e e-mail são obrigatórios.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Verifica se já existe usuário com esse e-mail
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return json({ error: 'Erro ao verificar e-mail existente.' }, 500)
  }
  if (existingUsers.users.some((u) => u.email?.toLowerCase() === ownerEmail)) {
    return json({ error: 'Já existe uma conta com esse e-mail.' }, 409)
  }

  // 2. Cria o usuário de autenticação com senha temporária
  const tempPassword = generateTempPassword()
  const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: tempPassword,
    email_confirm: true,
  })

  if (createUserError || !userData.user) {
    console.error('Erro ao criar usuário:', createUserError)
    return json({ error: 'Não foi possível criar a conta do dono.' }, 500)
  }

  const userId = userData.user.id

  // 3. Cria salão, perfil e profissional. Se algo falhar, desfaz tudo (inclusive o usuário).
  try {
    const { data: salon, error: salonError } = await admin
      .from('salons')
      .insert({ nome: salonName, telefone: salonPhone })
      .select('id')
      .single()
    if (salonError || !salon) throw salonError ?? new Error('Falha ao criar salão.')

    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: userId, salon_id: salon.id, role: 'owner' })
    if (profileError) throw profileError

    const { error: professionalError } = await admin
      .from('professionals')
      .insert({ salon_id: salon.id, user_id: userId, nome: ownerName, telefone: ownerPhone, ativo: true })
    if (professionalError) throw professionalError

    return json({
      email: ownerEmail,
      tempPassword,
      salonId: salon.id,
    })
  } catch (err) {
    console.error('Erro ao provisionar salão, desfazendo usuário:', err)
    await admin.auth.admin.deleteUser(userId)
    return json({ error: 'Não foi possível concluir o cadastro. Nada foi salvo, pode tentar novamente.' }, 500)
  }
})
