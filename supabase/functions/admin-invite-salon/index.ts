import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Convite de dono — cadastrar barbearia sem estar frente a frente.
 *
 * A `admin-create-salon` só funciona com as duas pessoas juntas: alguém precisa
 * saber endereço, telefone, horário dos sete dias e o catálogo com preço e
 * duração de cada serviço, e digitar tudo. Por WhatsApp isso vira uma entrevista
 * de dias, e o interesse esfria entre o "quero" e o "está pronto".
 *
 * Aqui só o que não dá para adivinhar é perguntado: o nome da barbearia e o
 * e-mail do dono. O resto se assume — horário e catálogo padrão, os mesmos que o
 * wizard já oferece pré-marcados. O dono corrige o que não serve em
 * Configurações e Catálogo depois de entrar.
 *
 * Função separada, e não mais uma ação dentro de `admin-create-salon`, por dois
 * motivos: aquela função tem 21 mil caracteres e cada publicação dela arrisca o
 * cadastro presencial, que é o caminho que já traz clientes; e este fluxo tem
 * ciclo de vida próprio — nasce, expira em 10 dias, e pode ser refeito sem
 * tocar em nada do outro.
 */

const ADMIN_TOOL_SECRET = Deno.env.get('ADMIN_TOOL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://clubcut.vercel.app'

/** Dias que o link fica de pé. Decidido em 2026-08-11: convite eterno vira
 *  link vazando por aí que cria acesso. */
const DIAS_DE_VALIDADE = 10

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

type Servico = { nome?: string; preco?: number; duracao_minutos?: number }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

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

  const nomeSalao = (body.nome as string | undefined)?.trim()
  const emailDono = (body.email as string | undefined)?.trim().toLowerCase()
  const servicos = (body.servicos as Servico[]) ?? []
  const horario = body.horario_funcionamento ?? null
  const donoAtende = body.dono_atende !== false
  const diasDeTeste =
    typeof body.dias_de_teste === 'number' && body.dias_de_teste > 0 ? body.dias_de_teste : null

  if (!nomeSalao) return json({ error: 'Informe o nome da barbearia.' }, 400)
  if (!emailDono || !/^\S+@\S+\.\S+$/.test(emailDono)) {
    return json({ error: 'Informe um e-mail válido.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // E-mail já cadastrado seria descoberto só no aceite — depois de você mandar
  // o link e o dono escolher uma senha. A pior hora possível para ele descobrir
  // que não vai entrar.
  const { data: usuarios, error: erroUsuarios } = await admin.auth.admin.listUsers()
  if (erroUsuarios) {
    console.error('Erro ao listar usuarios:', erroUsuarios)
    return json({ error: 'Não foi possível verificar o e-mail.' }, 500)
  }
  if (usuarios.users.some((u) => u.email?.toLowerCase() === emailDono)) {
    return json({ error: 'Já existe uma conta com esse e-mail.' }, 409)
  }

  let salonId: string | null = null
  try {
    const { data: salon, error: erroSalao } = await admin
      .from('salons')
      .insert({ nome: nomeSalao, horario_funcionamento: horario })
      .select('id')
      .single()
    if (erroSalao || !salon) throw erroSalao ?? new Error('Falha ao criar a barbearia.')
    salonId = salon.id

    // `acesso_ate` NULO de propósito: o teste começa no ACEITE, não agora.
    //
    // Se o relógio começasse aqui, o dono que abrisse o link três dias depois
    // testaria por quatro; abrindo no décimo dia, encontraria o CRM já
    // bloqueado e teria como primeira impressão do produto uma tela de acesso
    // vencido. Quem grava a data é `accept-invite`.
    // Sem plano desde 2026-08-25: o modelo e por agendamento (faixas_de_uso).
    const { error: erroAssinatura } = await admin.from('subscriptions').insert({
      salon_id: salon.id,
      status: 'trial',
      acesso_ate: null,
    })
    if (erroAssinatura) throw erroAssinatura

    // Catálogo padrão: a barbearia nasce usável. Perguntar preço e duração de
    // cada serviço por mensagem é justamente o que trava a conversa.
    const validos = servicos.filter((s) => s.nome?.trim() && Number(s.preco) > 0)
    if (validos.length) {
      const { error: erroServicos } = await admin.from('services').insert(
        validos.map((s) => ({
          salon_id: salon.id,
          nome: s.nome!.trim(),
          preco: Number(s.preco),
          duracao_minutos: Number(s.duracao_minutos) || 30,
          ativo: true,
        })),
      )
      if (erroServicos) throw erroServicos
    }

    const expiraEm = new Date(Date.now() + DIAS_DE_VALIDADE * 86400000).toISOString()

    const { data: convite, error: erroConvite } = await admin
      .from('salon_invites')
      .insert({
        salon_id: salon.id,
        // Nulo: quem aceita digita o próprio nome. O contato salvo no WhatsApp
        // costuma ser apelido ou nome de empresa — o mesmo motivo pelo qual o
        // agente nunca supõe o nome do cliente.
        nome: null,
        email: emailDono,
        role: 'owner',
        dias_de_teste: diasDeTeste,
        dono_atende: donoAtende,
        expira_em: expiraEm,
      })
      .select('token')
      .single()
    if (erroConvite || !convite) throw erroConvite ?? new Error('Falha ao criar o convite.')

    return json({
      link: `${APP_URL}/convite/${convite.token}`,
      email: emailDono,
      salao: nomeSalao,
      expiraEm,
    })
  } catch (err) {
    console.error('Erro ao convidar dono, desfazendo:', err)
    // Sem a compensação sobraria uma barbearia fantasma no painel a cada falha,
    // com nome de um cliente que não existe. `on delete cascade` leva junto a
    // assinatura, os serviços e o convite.
    if (salonId) await admin.from('salons').delete().eq('id', salonId)
    return json({ error: 'Não foi possível gerar o convite. Tente novamente.' }, 500)
  }
})
