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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: { action?: string; token?: string; senha?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const token = body.token?.trim()
  if (!token) return json({ error: 'Convite não informado.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: convite, error: conviteError } = await admin
    .from('salon_invites')
    .select('id, salon_id, nome, email, role, comissao_percentual, expira_em, usado_em, salons(nome)')
    .eq('token', token)
    .maybeSingle()

  if (conviteError || !convite) {
    return json({ error: 'Convite não encontrado. Peça um link novo ao dono.' }, 404)
  }
  if (convite.usado_em) {
    return json({ error: 'Este convite já foi usado.' }, 409)
  }
  if (new Date(convite.expira_em) < new Date()) {
    return json({ error: 'Este convite expirou. Peça um link novo ao dono.' }, 410)
  }

  const salonNome = (convite.salons as { nome?: string } | null)?.nome ?? 'a barbearia'

  // Só consulta os dados do convite (tela mostra antes de pedir a senha).
  if (body.action === 'check') {
    return json({
      nome: convite.nome,
      email: convite.email,
      salao: salonNome,
      role: convite.role,
    })
  }

  const senha = body.senha ?? ''
  if (senha.length < 8) {
    return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  }

  // E-mail já cadastrado?
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return json({ error: 'Não foi possível concluir o cadastro.' }, 500)
  }
  if (existingUsers.users.some((u) => u.email?.toLowerCase() === convite.email.toLowerCase())) {
    return json({ error: 'Já existe uma conta com esse e-mail.' }, 409)
  }

  let userId: string | null = null
  try {
    const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
      email: convite.email,
      password: senha,
      email_confirm: true,
    })
    if (createUserError || !userData.user) {
      throw createUserError ?? new Error('Falha ao criar a conta.')
    }
    userId = userData.user.id

    const { error: vinculoError } = await admin
      .from('user_salons')
      .insert({ user_id: userId, salon_id: convite.salon_id, role: convite.role })
    if (vinculoError) throw vinculoError

    const { error: perfilError } = await admin
      .from('profiles')
      .insert({ id: userId, salon_id: convite.salon_id, role: convite.role })
    if (perfilError) throw perfilError

    const { error: profissionalError } = await admin.from('professionals').insert({
      salon_id: convite.salon_id,
      user_id: userId,
      nome: convite.nome,
      ativo: true,
      comissao_percentual: convite.comissao_percentual,
    })
    if (profissionalError) throw profissionalError

    // Marca o convite como usado (uso único).
    await admin
      .from('salon_invites')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', convite.id)

    return json({ ok: true, email: convite.email, salao: salonNome })
  } catch (err) {
    console.error('Erro ao aceitar convite, desfazendo:', err)
    if (userId) await admin.auth.admin.deleteUser(userId)
    return json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, 500)
  }
})
