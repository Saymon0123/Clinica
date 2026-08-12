import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jornadaDoHorario } from '../_shared/jornada.ts'

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

  let body: {
    action?: string
    token?: string
    senha?: string
    nome?: string
    versaoTermos?: string
  } = {}
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
    .select(
      'id, salon_id, nome, email, role, comissao_percentual, dias_de_teste, dono_atende, expira_em, usado_em, salons(nome)',
    )
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
      // Convite de dono vem sem nome: a tela precisa pedir. Mandar isso
      // explícito evita a tela ter que deduzir da combinação de campos.
      pedeNome: !convite.nome,
    })
  }

  const senha = body.senha ?? ''
  if (senha.length < 8) {
    return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  }

  // No convite de dono o nome vem em branco e quem digita é quem aceita: o
  // contato salvo no WhatsApp costuma ser apelido ou nome de empresa, e o nome
  // vai para a ficha do profissional e para a agenda.
  const nomeFinal = (convite.nome ?? body.nome ?? '').trim()
  if (!nomeFinal) {
    return json({ error: 'Informe seu nome.' }, 400)
  }

  // Sem versão não há aceite: um registro que não diz QUAL texto foi aceito
  // não prova nada. A tela sempre manda; recusar aqui fecha o caminho de quem
  // chamar a função por fora dela.
  const versaoTermos = body.versaoTermos?.trim()
  if (!versaoTermos) {
    return json({ error: 'É preciso aceitar os termos de uso para continuar.' }, 400)
  }

  // E-mail já cadastrado?
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return json({ error: 'Não foi possível concluir o cadastro.' }, 500)
  }
  if (existingUsers.users.some((u) => u.email?.toLowerCase() === convite.email.toLowerCase())) {
    return json(
      {
        error:
          'Já existe uma conta com esse e-mail. Peça ao dono para trocar o e-mail deste convite na aba Equipe.',
      },
      409,
    )
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

    // Ter acesso e atender clientes são coisas diferentes. Barbeiro e gerente
    // sempre viram profissional; o dono só quando ele de fato atende — senão
    // ele apareceria na agenda e o agente passaria a oferecê-lo ao cliente no
    // WhatsApp como se fosse mais um barbeiro.
    const viraProfissional = convite.role !== 'owner' || convite.dono_atende !== false

    if (viraProfissional) {
      const { data: profissional, error: profissionalError } = await admin
        .from('professionals')
        .insert({
          salon_id: convite.salon_id,
          user_id: userId,
          nome: nomeFinal,
          ativo: true,
          comissao_percentual: convite.comissao_percentual,
        })
        .select('id')
        .single()
      if (profissionalError || !profissional) {
        throw profissionalError ?? new Error('Falha no profissional.')
      }

      // Sem vínculo com os serviços ele não apareceria como executante na
      // agenda. Entra fazendo tudo; o gestor ajusta depois na aba Equipe.
      const { data: servicos } = await admin
        .from('services')
        .select('id')
        .eq('salon_id', convite.salon_id)
        .eq('ativo', true)

      if (servicos?.length) {
        await admin
          .from('professional_services')
          .insert(servicos.map((s) => ({ professional_id: profissional.id, service_id: s.id })))
      }

      // Jornada do profissional, derivada do horário da barbearia. Sem ela a
      // auditoria acusa "barbearia configurada pela metade" no dia seguinte, e
      // o dono abre a aba Equipe e vê a jornada em branco.
      const { data: salaoRow } = await admin
        .from('salons')
        .select('horario_funcionamento')
        .eq('id', convite.salon_id)
        .maybeSingle()

      const jornada = jornadaDoHorario(salaoRow?.horario_funcionamento, profissional.id)
      if (jornada.length) await admin.from('professional_schedules').insert(jornada)
    }

    // O relógio do teste começa AGORA, no primeiro acesso — não na criação do
    // convite. Sem isto, quem abrisse o link no oitavo dia encontraria o CRM
    // bloqueado e teria como primeira impressão do produto uma tela de acesso
    // vencido.
    //
    // O filtro `acesso_ate is null` torna a escrita idempotente: uma assinatura
    // que já tem prazo (barbearia que voltou a ser convidada, por exemplo) não
    // ganha dias de graça.
    if (convite.role === 'owner' && convite.dias_de_teste) {
      const fim = new Date(Date.now() + convite.dias_de_teste * 86400000)
      const { error: erroTrial } = await admin
        .from('subscriptions')
        .update({ acesso_ate: fim.toISOString().slice(0, 10), status: 'trial' })
        .eq('salon_id', convite.salon_id)
        .is('acesso_ate', null)
      if (erroTrial) throw erroTrial
    }

    // A prova do aceite. Gravada ANTES de marcar o convite como usado: se
    // falhar, o catch desfaz a conta inteira e a pessoa tenta de novo — pior
    // seria a conta existir sem registro de que alguém aceitou alguma coisa.
    //
    // `ip` e `user_agent` saem do cabeçalho da requisição, não do corpo. Vindo
    // do formulário, quem aceita escolheria o que fica registrado.
    const { error: erroAceite } = await admin.from('termos_aceites').insert({
      user_id: userId,
      salon_id: convite.salon_id,
      versao: versaoTermos,
      ip:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('cf-connecting-ip') ??
        null,
      user_agent: req.headers.get('user-agent'),
    })
    if (erroAceite) throw erroAceite

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
