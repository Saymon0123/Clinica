import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jornadaDoHorario } from '../_shared/jornada.ts'

/**
 * Segundo passo do cadastro aberto: quem já tem conta cria a própria barbearia.
 *
 * O primeiro passo é o `signUp` do próprio Supabase, feito no navegador — ele
 * cuida da confirmação de e-mail, do limite de tentativas e das regras de
 * senha, e não precisa de código nosso. Aqui começa a parte que só o servidor
 * pode fazer.
 *
 * **Por que dois passos e não um.** Numa tela só, conta e barbearia nascem
 * juntas e cada falha no meio exige desfazer o que já foi criado. Separados, o
 * que sobra de uma falha é um usuário sem barbearia — estado inofensivo, que a
 * própria tela resolve tentando de novo. Este projeto já tem uma conta órfã
 * (`castrocollin01@gmail.com`) de quando isso não era separado.
 *
 * **Por que não pelo navegador.** Provisionar exige escrever em `salons` e
 * `subscriptions`. Abrir isso para o usuário deixaria qualquer um criar
 * assinatura com o plano e a validade que quisesse.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/**
 * Dias de teste do cadastro aberto.
 *
 * Passou de 7 para 14 em 2026-08-14: o valor do produto aparece quando o
 * cliente **volta** — quando um lembrete evita uma falta —, e numa barbearia
 * média isso leva mais de uma semana. Em gpt-4o-mini, dobrar o prazo custa
 * centavos por barbearia, e o teto da migration 0052 cobre o caso extremo.
 *
 * Cópia do que está em `src/lib/planos.ts`, porque edge function não importa
 * de `src/`. Ao mudar num, mudar no outro.
 */
const DIAS_DE_TESTE = 14

/** Teto de barbearias criadas por IP num dia. Não é segurança — é o que evita
 *  que um cadastro em massa vire conta da OpenAI antes de alguém perceber. */
const LIMITE_POR_IP_POR_DIA = 3

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

/** Mesmas chaves de `salons.horario_funcionamento`. Duplicado do front de
 *  propósito: o padrão do servidor não pode depender do que o navegador
 *  mandar, senão alguém abre a barbearia 24 horas por dia. */
const HORARIO_PADRAO = {
  dom: null,
  seg: { abre: '09:00', fecha: '19:00' },
  ter: { abre: '09:00', fecha: '19:00' },
  qua: { abre: '09:00', fecha: '19:00' },
  qui: { abre: '09:00', fecha: '19:00' },
  sex: { abre: '09:00', fecha: '20:00' },
  sab: { abre: '09:00', fecha: '18:00' },
}

const SERVICOS_PADRAO = [
  { nome: 'Corte masculino', preco: 45, duracao_minutos: 40 },
  { nome: 'Corte infantil', preco: 40, duracao_minutos: 40 },
  { nome: 'Barba', preco: 35, duracao_minutos: 30 },
  { nome: 'Corte + barba', preco: 70, duracao_minutos: 60 },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return json({ error: 'Nao autorizado.' }, 401)

  let body: { nome?: string; nomeSalao?: string; telefone?: string; versaoTermos?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido.' }, 400)
  }

  const nomePessoa = body.nome?.trim()
  const nomeSalao = body.nomeSalao?.trim()
  const versaoTermos = body.versaoTermos?.trim()
  // So digitos: o que chega da tela vem com parenteses e traco.
  const telefone = body.telefone?.replace(/\D/g, '') || null

  if (!nomePessoa) return json({ error: 'Informe seu nome.' }, 400)
  if (!nomeSalao) return json({ error: 'Informe o nome da barbearia.' }, 400)
  if (!versaoTermos) {
    return json({ error: 'E preciso aceitar os termos de uso para continuar.' }, 400)
  }

  // Quem está chamando? Usa o JWT de quem pediu, não o service role — é a
  // única forma de saber a identidade real de quem está do outro lado.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: auth, error: erroAuth } = await comoUsuario.auth.getUser()
  if (erroAuth || !auth.user) {
    return json({ error: 'Sessao invalida. Entre de novo.' }, 401)
  }
  const userId = auth.user.id

  // E-mail não confirmado não provisiona nada. É a trava que impede alguém de
  // criar conta com o e-mail de outra pessoa e sair usando o agente de IA, que
  // custa dinheiro por mensagem.
  if (!auth.user.email_confirmed_at) {
    return json(
      { error: 'Confirme seu e-mail antes de continuar. Verifique a caixa de entrada e o spam.' },
      403,
    )
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Já tem barbearia? Duas fontes de chamada repetida: clique duplo no botão e
  // recarregar a página no meio. Sem esta checagem, cada uma cria uma barbearia
  // nova, com assinatura e trial próprios.
  const { data: jaTem } = await admin
    .from('user_salons')
    .select('salon_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (jaTem) {
    return json({ salonId: jaTem.salon_id, jaExistia: true })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    null

  if (ip) {
    const desdeOntem = new Date(Date.now() - 86400000).toISOString()
    const { count } = await admin
      .from('termos_aceites')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('aceito_em', desdeOntem)
    if ((count ?? 0) >= LIMITE_POR_IP_POR_DIA) {
      console.warn('Limite de cadastros por IP atingido:', ip)
      return json(
        { error: 'Muitos cadastros a partir desta conexao. Tente novamente amanha.' },
        429,
      )
    }
  }

  let salonId: string | null = null
  try {
    const { data: salon, error: erroSalao } = await admin
      .from('salons')
      .insert({ nome: nomeSalao, telefone, horario_funcionamento: HORARIO_PADRAO })
      .select('id')
      .single()
    if (erroSalao || !salon) throw erroSalao ?? new Error('Falha ao criar a barbearia.')
    salonId = salon.id

    const { error: erroVinculo } = await admin
      .from('user_salons')
      .insert({ user_id: userId, salon_id: salon.id, role: 'owner' })
    if (erroVinculo) throw erroVinculo

    // O relógio do teste começa agora: diferente do convite, aqui a pessoa
    // está entrando neste exato momento.
    const fim = new Date(Date.now() + DIAS_DE_TESTE * 86400000)
    // Sem plano desde 2026-08-25: o modelo e por agendamento (faixas_de_uso).
    // A assinatura guarda so a situacao do acesso.
    const { error: erroAssinatura } = await admin.from('subscriptions').insert({
      salon_id: salon.id,
      status: 'trial',
      acesso_ate: fim.toISOString().slice(0, 10),
    })
    if (erroAssinatura) throw erroAssinatura

    // Quem se cadastra sozinho atende — dono que só administra é caso de
    // barbearia com equipe, e esse ajusta depois na aba Equipe.
    const { data: profissional, error: erroProf } = await admin
      .from('professionals')
      .insert({ salon_id: salon.id, user_id: userId, nome: nomePessoa, telefone, ativo: true })
      .select('id')
      .single()
    if (erroProf || !profissional) throw erroProf ?? new Error('Falha ao criar o profissional.')

    const jornada = jornadaDoHorario(HORARIO_PADRAO, profissional.id)
    if (jornada.length) {
      const { error: erroJornada } = await admin.from('professional_schedules').insert(jornada)
      if (erroJornada) throw erroJornada
    }

    // Catálogo inicial: sem ele a barbearia nasce sem nada para agendar, e o
    // agente não teria o que oferecer.
    const { data: servicos, error: erroServicos } = await admin
      .from('services')
      .insert(SERVICOS_PADRAO.map((s) => ({ ...s, salon_id: salon.id, ativo: true })))
      .select('id')
    if (erroServicos) throw erroServicos

    if (servicos?.length) {
      const { error: erroLigacao } = await admin
        .from('professional_services')
        .insert(servicos.map((s) => ({ professional_id: profissional.id, service_id: s.id })))
      if (erroLigacao) throw erroLigacao
    }

    // A prova do aceite, com IP e navegador lidos do cabeçalho.
    const { error: erroAceite } = await admin.from('termos_aceites').insert({
      user_id: userId,
      salon_id: salon.id,
      versao: versaoTermos,
      ip,
      user_agent: req.headers.get('user-agent'),
    })
    if (erroAceite) throw erroAceite

    return json({ salonId: salon.id, nome: nomeSalao })
  } catch (err) {
    console.error('Erro ao provisionar barbearia, desfazendo:', err)
    // A conta continua de pé — é dela que a pessoa vai tentar de novo. O que
    // se desfaz é a barbearia pela metade; `on delete cascade` leva junto
    // vínculo, assinatura, profissional, jornada e serviços.
    if (salonId) await admin.from('salons').delete().eq('id', salonId)
    return json({ error: 'Nao foi possivel criar a barbearia. Tente novamente.' }, 500)
  }
})
