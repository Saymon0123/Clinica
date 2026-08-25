import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jornadaDoHorario } from '../_shared/jornada.ts'

/**
 * Aceite de convite para a equipe — com DOIS caminhos, e a diferença importa.
 *
 * Uma pessoa é um login; barbearias são vínculos (`user_salons`). Barbeiro que
 * atende em duas casas é comum no ramo, e o schema sempre permitiu — mas este
 * fluxo tratava "e-mail já tem conta" como beco sem saída, mandando o dono
 * "trocar o e-mail do convite", isto é, pedindo à pessoa um e-mail falso para
 * poder trabalhar.
 *
 * - **Conta não existe:** cria login + vínculo, como sempre.
 * - **Conta existe:** pede a senha ATUAL e só vincula. A senha aqui não é
 *   burocracia — é a prova de posse do e-mail. Sem ela, qualquer dono que
 *   digitasse o e-mail de um terceiro num convite o colocaria numa equipe sem
 *   consentimento; e como o fluxo antigo deixava definir senha nova, quem
 *   abrisse o link poderia sequestrar a conta alheia.
 *
 * A verificação de existência é a RPC `user_id_por_email`, não `listUsers()`:
 * a listagem sem paginação funciona com 5 contas e quebra em silêncio a partir
 * de 50 — o e-mail some da primeira página e o fluxo tenta criar de novo.
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


/**
 * Limite de tentativas via banco (0111). `fechado=true` => responder 429.
 * Em erro do proprio limitador, deixa passar: derrubar o fluxo legitimo por
 * falha do freio seria pior que uma janela sem freio.
 */
async function taxaExcedida(admin: ReturnType<typeof createClient>, chave: string, limite: number, janelaSegundos: number) {
  const { data, error } = await admin.rpc('taxa_excedida', {
    p_chave: chave,
    p_limite: limite,
    p_janela_segundos: janelaSegundos,
  })
  if (error) {
    console.error('Limitador de taxa indisponivel:', error)
    return false
  }
  return data === true
}

function ipDe(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'sem-ip'
  )
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

  // Quem é (se já é alguém). Decide qual dos dois caminhos a tela mostra.
  const { data: usuarioExistente, error: erroBusca } = await admin.rpc('user_id_por_email', {
    p_email: convite.email,
  })
  if (erroBusca) {
    console.error('Erro ao buscar usuário por e-mail:', erroBusca)
    return json({ error: 'Não foi possível carregar o convite. Tente novamente.' }, 500)
  }
  const idExistente: string | null = usuarioExistente ?? null

  // Já faz parte DESTA barbearia? Aí não há o que aceitar — e descobrir isso
  // aqui evita pedir senha para no fim dizer que era à toa.
  if (idExistente) {
    const { data: vinculo } = await admin
      .from('user_salons')
      .select('user_id')
      .eq('user_id', idExistente)
      .eq('salon_id', convite.salon_id)
      .maybeSingle()
    if (vinculo) {
      return json(
        { error: `Você já faz parte da equipe de ${salonNome}. É só entrar com sua conta.` },
        409,
      )
    }
  }

  // Só consulta os dados do convite (tela mostra antes de pedir a senha).
  // Freios do giro de 2026-08-25: o token chega por e-mail/WhatsApp, entao
  // quem o tiver nao pode ganhar um endpoint de forca bruta de senha.
  // 30 chamadas por IP a cada 10 min cobre uso real com folga.
  if (await taxaExcedida(admin, `invite:${ipDe(req)}`, 30, 600)) {
    return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
  }

  if (body.action === 'check') {
    return json({
      nome: convite.nome,
      email: convite.email,
      salao: salonNome,
      role: convite.role,
      // Convite de dono vem sem nome: a tela precisa pedir. Mandar isso
      // explícito evita a tela ter que deduzir da combinação de campos.
      pedeNome: !convite.nome,
      // Muda a tela: quem já tem conta ENTRA com a senha que possui, em vez
      // de criar uma. Revela que o e-mail tem cadastro — a mesma informação
      // que o erro antigo já entregava, só que agora com um caminho adiante.
      contaExiste: Boolean(idExistente),
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

  let userId: string | null = null
  // Só a conta criada AGORA pode ser desfeita no catch. Apagar uma conta que
  // já existia — com vínculos em outras barbearias — seria transformar um erro
  // transitório aqui em desastre lá.
  let criadaAgora = false

  try {
    if (idExistente) {
      // A prova de posse: entrar com a senha atual. O cliente é o anônimo de
      // propósito — o admin não valida senha, e é exatamente a validação que
      // separa "o dono do e-mail aceitou" de "alguém com o link aceitou".
      const anon = createClient(SUPABASE_URL, ANON_KEY)
      // 5 senhas erradas por token a cada 15 min: forca bruta morre aqui.
      if (await taxaExcedida(admin, `invite-senha:${token}`, 5, 900)) {
        return json({ error: 'Muitas tentativas de senha. Aguarde 15 minutos.' }, 429)
      }

      const { data: login, error: loginError } = await anon.auth.signInWithPassword({
        email: convite.email,
        password: senha,
      })
      if (loginError || !login.user) {
        return json(
          { error: 'Senha incorreta. Use a senha da sua conta Club Cut já existente.' },
          401,
        )
      }
      userId = login.user.id
      // Sessão criada só para provar a senha; não é para ficar aberta.
      await anon.auth.signOut()
    } else {
      const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
        email: convite.email,
        password: senha,
        email_confirm: true,
      })
      if (createUserError || !userData.user) {
        throw createUserError ?? new Error('Falha ao criar a conta.')
      }
      userId = userData.user.id
      criadaAgora = true
    }

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
    // falhar, o catch desfaz e a pessoa tenta de novo — pior seria o vínculo
    // existir sem registro de que alguém aceitou alguma coisa. Quem já tinha
    // conta também assina: o aceite é por barbearia, não por login.
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

    return json({ ok: true, email: convite.email, salao: salonNome, contaExistia: !criadaAgora })
  } catch (err) {
    console.error('Erro ao aceitar convite, desfazendo:', err)
    if (userId && criadaAgora) {
      // Conta nova incompleta: apagar inteira e deixar tentar de novo.
      await admin.auth.admin.deleteUser(userId)
    } else if (userId) {
      // Conta pré-existente: desfazer só o que ESTE aceite criou. A ordem é a
      // inversa da criação; o profissional leva junto serviços e jornada por
      // cascata do banco.
      await admin
        .from('professionals')
        .delete()
        .eq('user_id', userId)
        .eq('salon_id', convite.salon_id)
      await admin
        .from('user_salons')
        .delete()
        .eq('user_id', userId)
        .eq('salon_id', convite.salon_id)
    }
    return json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' }, 500)
  }
})
