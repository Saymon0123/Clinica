import { createClient } from 'jsr:@supabase/supabase-js@2'
import { comSentry } from '../_shared/sentry.ts'
import type { ClienteAdmin } from '../_shared/supabase.ts'

/**
 * Metricas do produto para o painel administrativo.
 *
 * Funcao propria, e nao mais uma acao dentro de `admin-create-salon`: aquela
 * tem 21 mil caracteres e cada publicacao dela arrisca o cadastro presencial,
 * que e o caminho que ja traz clientes. Mesma razao de `admin-invite-salon`.
 *
 * Ate a revisao de seguranca de 11/09 esta funcao so existia em producao, fora
 * do repositorio. Entrou com as mesmas travas das outras duas do painel: senha
 * comparada em tempo constante, limite de tentativas por IP e captura de erro
 * no Sentry.
 */

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

/** Limite de tentativas via banco (0111). Erro do limitador deixa passar. */
async function taxaExcedida(admin: ClienteAdmin, chave: string, limite: number, janelaSegundos: number) {
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

/** Comparacao em tempo constante: '!==' vaza pelo relogio quantos bytes bateram. */
function segredoConfere(recebido: string | null, esperado: string) {
  if (!recebido || recebido.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < recebido.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diff === 0
}

Deno.serve(comSentry('admin-metricas', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!ADMIN_TOOL_SECRET) {
    return json({ error: 'Ferramenta nao configurada (ADMIN_TOOL_SECRET ausente).' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  // A mesma chave das outras funcoes do painel: quem martela uma delas
  // tentando a senha nao ganha outra porta para continuar.
  if (await taxaExcedida(admin, `admin:${ipDe(req)}`, 20, 600)) {
    return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429)
  }
  if (!segredoConfere(req.headers.get('x-admin-secret'), ADMIN_TOOL_SECRET)) {
    return json({ error: 'Nao autorizado.' }, 401)
  }

  const { data, error } = await admin.from('metricas_do_produto').select('*').maybeSingle()
  if (error) {
    console.error('Erro ao ler metricas:', error)
    return json({ error: 'Nao foi possivel carregar as metricas.' }, 500)
  }

  return json({ metricas: data })
}))
