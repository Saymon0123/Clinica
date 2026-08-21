import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Webhook da Cloud API da Meta — a porta de entrada das mensagens.
 *
 * Substitui o webhook da Evolution, e as duas convivem durante a migração:
 * `whatsapp_connections.provedor` diz por onde cada barbearia fala hoje.
 *
 * **Roda sem usuário** (`verify_jwt: false`) — quem chama é a Meta, que não tem
 * como mandar o nosso JWT. Por isso a autenticação aqui é feita de outro jeito,
 * e é a parte mais importante deste arquivo:
 *
 * 1. **GET** responde ao desafio de verificação, comparando um token que só nós
 *    e a Meta conhecemos.
 * 2. **POST** confere a assinatura `X-Hub-Signature-256`, que é um HMAC do
 *    corpo com o App Secret. Sem isso, qualquer um que descubra a URL manda
 *    mensagem falsa e o agente responde como se fosse cliente.
 *
 * **Sempre responde 200, mesmo quando dá errado.** Não é preguiça: a Meta
 * reenvia o que não recebeu 200 e, depois de falhas repetidas, **desativa o
 * webhook da aplicação inteira**. Um erro nosso numa barbearia não pode calar
 * todas as outras. O que dá errado é registrado, não devolvido como 500.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''
const N8N_WEBHOOK_URL = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL') ?? ''

/** Sempre 200 para a Meta. Ver o cabeçalho do arquivo. */
function ok(detalhe?: string) {
  return new Response(detalhe ?? 'EVENT_RECEIVED', { status: 200 })
}

/**
 * Confere o HMAC do corpo com o App Secret.
 *
 * Comparação em tempo constante: comparar strings com `===` vaza, pelo tempo de
 * resposta, quantos bytes iniciais bateram — e com isso dá para descobrir a
 * assinatura correta byte a byte. Custa três linhas evitar.
 */
async function assinaturaConfere(corpo: string, cabecalho: string | null) {
  if (!APP_SECRET) return false
  if (!cabecalho?.startsWith('sha256=')) return false

  const esperado = cabecalho.slice('sha256='.length)
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo))
  const calculado = Array.from(new Uint8Array(assinado))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (calculado.length !== esperado.length) return false
  let diferenca = 0
  for (let i = 0; i < calculado.length; i++) {
    diferenca |= calculado.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferenca === 0
}

type MensagemRecebida = {
  from: string
  id: string
  type: string
  text?: { body: string }
  /** Resposta de botão de template — é assim que "Sim, confirmo" chega. */
  button?: { text: string; payload: string }
  interactive?: { button_reply?: { id: string; title: string } }
}

/**
 * O texto que interessa, venha ele de onde vier.
 *
 * Botão de template não chega como texto: chega em `button` ou em
 * `interactive.button_reply`. Sem tratar os três, o cliente aperta
 * "Sim, confirmo" e o agente não recebe nada.
 */
function textoDaMensagem(m: MensagemRecebida): string | null {
  if (m.type === 'text') return m.text?.body ?? null
  if (m.button?.text) return m.button.text
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title
  return null
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ---------- Verificação do webhook ----------
  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const desafio = url.searchParams.get('hub.challenge')

    if (modo === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(desafio ?? '', { status: 200 })
    }
    // Aqui 403 é correto: não é a Meta entregando mensagem, é alguém tentando
    // registrar um webhook que não é nosso.
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const corpo = await req.text()

  if (!(await assinaturaConfere(corpo, req.headers.get('x-hub-signature-256')))) {
    console.error('Assinatura invalida no webhook do WhatsApp')
    // 200 mesmo assim: se for a Meta com o nosso App Secret errado, devolver
    // erro faria ela desativar o webhook. O log é que denuncia o problema.
    return ok('IGNORED')
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const evento = JSON.parse(corpo)

    for (const entrada of evento.entry ?? []) {
      for (const mudanca of entrada.changes ?? []) {
        const valor = mudanca.value ?? {}
        const phoneNumberId: string | undefined = valor.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // A tradução número -> barbearia. Nulo significa número desconhecido, e
        // aí o certo é PARAR: seguir com uma barbearia arbitrária gravaria a
        // conversa de um cliente na conta de outro dono.
        const { data: salonId } = await admin.rpc('salon_por_phone_number_id', {
          p_phone_number_id: phoneNumberId,
        })
        if (!salonId) {
          console.error('phone_number_id desconhecido:', phoneNumberId)
          continue
        }

        // Status de entrega (enviado, lido, falhou) chega no mesmo webhook das
        // mensagens. Não é conversa, e o agente não deve ser acordado por isso.
        if (valor.statuses?.length) continue

        for (const m of (valor.messages ?? []) as MensagemRecebida[]) {
          const texto = textoDaMensagem(m)
          if (!texto) {
            console.error('Tipo de mensagem sem texto tratavel:', m.type)
            continue
          }

          if (!N8N_WEBHOOK_URL) {
            console.error('N8N_WHATSAPP_WEBHOOK_URL nao configurada')
            continue
          }

          // O agente continua no n8n. Esta função é a porta, não o cérebro:
          // ela autentica, descobre de quem é a mensagem e entrega — o que a
          // torna testável e substituível sem tocar no agente.
          const resposta = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              salon_id: salonId,
              phone_number_id: phoneNumberId,
              waba_id: entrada.id ?? null,
              contact_phone: m.from,
              contact_name: valor.contacts?.[0]?.profile?.name ?? null,
              message_id: m.id,
              texto,
              // De botão ou digitada: o agente trata diferente uma confirmação
              // vinda de "Sim, confirmo" e uma frase solta.
              origem: m.type === 'text' ? 'texto' : 'botao',
            }),
          })
          if (!resposta.ok) {
            console.error('n8n recusou a mensagem:', resposta.status, await resposta.text())
          }
        }
      }
    }
  } catch (erro) {
    // Nunca propaga: ver o cabeçalho sobre por que 200 sempre.
    console.error('Erro tratando webhook do WhatsApp:', erro)
  }

  return ok()
})
