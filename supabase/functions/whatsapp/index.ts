import { createClient } from 'jsr:@supabase/supabase-js@2'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

function instanceNameFor(salonId: string) {
  return `salon-${salonId}`
}

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

async function evoFetch(path: string, init: RequestInit = {}) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_URL/EVOLUTION_API_KEY não configurados no projeto Supabase.')
  }
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Não autenticado.' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return json({ error: 'Não autenticado.' }, 401)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return json({ error: 'Salão não encontrado para este usuário.' }, 404)
  }

  const salonId = profile.salon_id as string
  const instanceName = instanceNameFor(salonId)

  let body: { action?: string; conversationId?: string; content?: string } = {}
  try {
    body = await req.json()
  } catch {
    // sem corpo
  }

  try {
    if (body.action === 'connect') {
      // Tenta criar a instância; se já existir, ignora o erro e segue para pegar o QR.
      await evoFetch('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      })

      const connectResult = await evoFetch(`/instance/connect/${instanceName}`, { method: 'GET' })
      if (!connectResult.ok) {
        return json({ error: 'Não foi possível gerar o QR code na Evolution API.' }, 502)
      }

      const evoData = connectResult.data as Record<string, unknown> | null
      const qrCode =
        (evoData?.base64 as string | undefined) ??
        (evoData?.qrcode as { base64?: string } | undefined)?.base64 ??
        null

      await supabase.from('whatsapp_connections').upsert({
        salon_id: salonId,
        instance_name: instanceName,
        status: 'connecting',
        updated_at: new Date().toISOString(),
      })

      return json({ status: 'connecting', qrCode })
    }

    if (body.action === 'status') {
      const stateResult = await evoFetch(`/instance/connectionState/${instanceName}`, { method: 'GET' })
      const evoData = stateResult.data as { instance?: { state?: string } } | null
      const rawState = evoData?.instance?.state ?? 'close'
      const status = rawState === 'open' ? 'open' : rawState === 'connecting' ? 'connecting' : 'close'

      await supabase.from('whatsapp_connections').upsert({
        salon_id: salonId,
        instance_name: instanceName,
        status,
        updated_at: new Date().toISOString(),
      })

      return json({ status })
    }

    if (body.action === 'disconnect') {
      await evoFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' })

      await supabase.from('whatsapp_connections').upsert({
        salon_id: salonId,
        instance_name: instanceName,
        status: 'close',
        updated_at: new Date().toISOString(),
      })

      return json({ status: 'close' })
    }

    if (body.action === 'send') {
      const { conversationId, content } = body
      if (!conversationId || !content?.trim()) {
        return json({ error: 'Conversa e mensagem são obrigatórias.' }, 400)
      }

      const { data: conversation, error: convError } = await supabase
        .from('whatsapp_conversations')
        .select('id, contact_phone, salon_id')
        .eq('id', conversationId)
        .maybeSingle()

      if (convError || !conversation || conversation.salon_id !== salonId) {
        return json({ error: 'Conversa não encontrada.' }, 404)
      }

      const sendResult = await evoFetch(`/message/sendText/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          number: conversation.contact_phone,
          text: content.trim(),
        }),
      })

      if (!sendResult.ok) {
        return json({ error: 'Não foi possível enviar a mensagem pelo WhatsApp.' }, 502)
      }

      const { data: message, error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'out',
          sender: 'dono',
          content: content.trim(),
        })
        .select()
        .single()

      if (insertError) {
        return json({ error: 'Mensagem enviada, mas não foi possível salvar no histórico.' }, 500)
      }

      // Não mexe em needs_human aqui: a conversa continua marcada como
      // "precisa do dono" até ele explicitamente devolver ao agente.
      await supabase
        .from('whatsapp_conversations')
        .update({ agent_paused: true })
        .eq('id', conversationId)

      return json({ message })
    }

    if (body.action === 'resume_agent') {
      const { conversationId } = body
      if (!conversationId) {
        return json({ error: 'Conversa é obrigatória.' }, 400)
      }

      const { data: conversation, error: convError } = await supabase
        .from('whatsapp_conversations')
        .select('id, salon_id')
        .eq('id', conversationId)
        .maybeSingle()

      if (convError || !conversation || conversation.salon_id !== salonId) {
        return json({ error: 'Conversa não encontrada.' }, 404)
      }

      // Devolver ao agente resolve o pedido por completo: sai da lista de
      // "precisa do dono" e o agente volta a responder normalmente.
      await supabase
        .from('whatsapp_conversations')
        .update({ agent_paused: false, needs_human: false })
        .eq('id', conversationId)

      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    console.error('Erro na função whatsapp:', err)
    return json({ error: 'Erro ao comunicar com a Evolution API.' }, 500)
  }
})
