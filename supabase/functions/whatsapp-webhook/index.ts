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
const N8N_LEMBRETE_URL = Deno.env.get('N8N_LEMBRETE_RESPOSTA_URL') ?? ''

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
  /**
   * A qual mensagem esta responde. Para clique em botao de template, traz o
   * `wamid` do lembrete que enviamos -- e e por ele, e so por ele, que o
   * clique e reconhecido como resposta de lembrete.
   */
  context?: { id?: string }
  text?: { body: string }
  /** Resposta de botão de template — é assim que "Sim, confirmo" chega. */
  button?: { text: string; payload: string }
  interactive?: { button_reply?: { id: string; title: string } }
  audio?: { id: string; mime_type?: string; voice?: boolean }
  image?: { id: string; mime_type?: string; caption?: string }
  video?: { id: string; mime_type?: string; caption?: string }
  document?: { id: string; mime_type?: string; filename?: string }
}

type Conteudo = { texto: string | null; media_id: string | null; tipo: string }

/**
 * O que interessa da mensagem, venha ela de onde vier.
 *
 * Botão de template não chega como texto: chega em `button` ou em
 * `interactive.button_reply`. Sem tratar os três, o cliente aperta
 * "Sim, confirmo" e o agente não recebe nada.
 *
 * **Áudio e imagem não chegam com conteúdo** — chegam com um `id` de mídia, e
 * ouvir ou ver exige uma segunda chamada à API para baixar o arquivo. Por isso
 * o `media_id` é repassado ao n8n em vez de resolvido aqui: a transcrição e a
 * descrição de imagem **já existem lá** (nós `Transcrever Áudio` e
 * `Descrever Imagem`), e duplicá-las aqui criaria duas verdades sobre como o
 * sistema entende áudio.
 *
 * Cliente de barbearia manda áudio o tempo todo. Uma versão anterior desta
 * função descartava tudo que não fosse texto ou botão — e teria feito metade
 * das mensagens sumirem em silêncio na migração.
 */
function conteudoDaMensagem(m: MensagemRecebida): Conteudo {
  if (m.type === 'text') return { texto: m.text?.body ?? null, media_id: null, tipo: 'texto' }
  if (m.button?.text) return { texto: m.button.text, media_id: null, tipo: 'botao' }
  if (m.interactive?.button_reply?.title) {
    return { texto: m.interactive.button_reply.title, media_id: null, tipo: 'botao' }
  }
  if (m.type === 'audio') return { texto: null, media_id: m.audio?.id ?? null, tipo: 'audio' }
  if (m.type === 'image') {
    return { texto: m.image?.caption ?? null, media_id: m.image?.id ?? null, tipo: 'imagem' }
  }
  if (m.type === 'video') {
    return { texto: m.video?.caption ?? null, media_id: m.video?.id ?? null, tipo: 'video' }
  }
  if (m.type === 'document') {
    return { texto: m.document?.filename ?? null, media_id: m.document?.id ?? null, tipo: 'documento' }
  }
  return { texto: null, media_id: null, tipo: m.type }
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

        // A tradução número -> barbearia. Nulo tem DOIS significados no modelo
        // híbrido: número desconhecido (paramos) ou o REMETENTE CENTRAL da
        // plataforma — o número nosso que envia lembrete/reativação por todas
        // as barbearias. Nele não existe "salão do número": o salão vem do
        // wamid do template respondido, via responder_lembrete.
        const { data: salonId } = await admin.rpc('salon_por_phone_number_id', {
          p_phone_number_id: phoneNumberId,
        })
        if (!salonId) {
          const { data: central } = await admin
            .from('remetentes_oficiais')
            .select('phone_number_id')
            .eq('phone_number_id', phoneNumberId)
            .eq('ativo', true)
            .maybeSingle()
          if (!central) {
            console.error('phone_number_id desconhecido:', phoneNumberId)
            continue
          }
          if (valor.statuses?.length) continue

          for (const m of (valor.messages ?? []) as MensagemRecebida[]) {
            const { texto, tipo } = conteudoDaMensagem(m)

            // Clique de botão com contexto: o banco resolve tudo, inclusive
            // de qual barbearia é o agendamento.
            if (tipo === 'botao' && m.context?.id && texto) {
              const { data: r, error } = await admin.rpc('responder_lembrete', {
                p_message_id: m.context.id,
                p_botao: texto,
              })
              if (error) {
                console.error('responder_lembrete (central) falhou:', error.message)
                continue
              }
              if (r?.atendido && (r.resposta || r.entregar_ao_agente) && N8N_LEMBRETE_URL) {
                // Reagendar no número central NÃO vai ao agente: o agente mora
                // no número da barbearia (Evolution). O fluxo de resposta troca
                // entregar_ao_agente pelo convite com o wa.me da barbearia.
                await fetch(N8N_LEMBRETE_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    salon_id: r.salon_id ?? null,
                    phone_number_id: phoneNumberId,
                    contact_phone: m.from,
                    appointment_id: r.appointment_id ?? null,
                    acao: r.entregar_ao_agente ? 'reagendar_central' : r.acao,
                    resposta: r.resposta ?? null,
                  }),
                })
              }
              continue
            }

            // Texto solto no número de avisos: não há barbearia nem agente
            // aqui. Fase 2 responde educadamente apontando o número certo;
            // por ora, registra e segue — nada de salão arbitrário.
            console.error('mensagem sem contexto no numero central, de:', m.from, 'tipo:', tipo)
          }
          continue
        }

        // Status de entrega (enviado, lido, falhou) chega no mesmo webhook das
        // mensagens. Não é conversa, e o agente não deve ser acordado por isso.
        if (valor.statuses?.length) continue

        for (const m of (valor.messages ?? []) as MensagemRecebida[]) {
          const { texto, media_id, tipo } = conteudoDaMensagem(m)

          // Só descarta o que não tem texto NEM mídia — figurinha, localização,
          // contato. Áudio e imagem seguem com o media_id para o n8n resolver.
          if (!texto && !media_id) {
            console.error('Mensagem sem texto e sem midia, tipo:', m.type)
            continue
          }

          /**
           * Resposta ao lembrete: decidida pelo banco, nao pelo agente.
           *
           * Um clique em "Sim, confirmo" tem tres valores possiveis e um
           * significado exato em cada um. Passar isso por um modelo de
           * linguagem troca uma decisao certa por uma provavel -- e ainda
           * paga uma chamada de LLM por clique, todo dia, em todo
           * agendamento.
           *
           * O reconhecimento e pelo `context.id`, nunca pelo texto: e isso
           * que impede que um cliente que digitou "cancelar" no meio de uma
           * conversa tenha o horario cancelado sem falar com ninguem.
           *
           * `atendido = false` devolve a mensagem ao caminho normal. Nenhum
           * caso duvidoso morre aqui em silencio -- na duvida, o agente le.
           */
          // Preenchido so quando o cliente pediu reagendamento pelo botao.
          // O agente precisa saber que ja existe um horario marcado e que a
          // conversa comeca no meio -- sem isso ele trataria como um pedido
          // novo e poderia deixar o cliente com dois horarios.
          let contextoLembrete: string | null = null

          if (tipo === 'botao' && m.context?.id) {
            const { data: r, error } = await admin.rpc('responder_lembrete', {
              p_message_id: m.context.id,
              p_botao: texto,
            })

            if (error) {
              // Cai para o caminho normal: o agente atendendo mal e melhor
              // que o cliente sendo ignorado.
              console.error('responder_lembrete falhou:', error.message)
            } else if (r?.atendido) {
              // Reagendar e a unica das tres que nao termina em si mesma:
              // escolher outro horario e conversa. O clique ja foi aplicado
              // no banco; o que segue para o agente e o que vem depois dele.
              if (r.entregar_ao_agente) {
                contextoLembrete =
                  'O cliente clicou em Reagendar no lembrete do agendamento '
                  + r.appointment_id
                  + '. Ele JA TEM esse horario marcado: ofereca horarios novos e,'
                  + ' ao confirmar, REMARQUE o existente em vez de criar outro.'
              } else {
                if (r.resposta && N8N_LEMBRETE_URL) {
                  await fetch(N8N_LEMBRETE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      salon_id: salonId,
                      phone_number_id: phoneNumberId,
                      contact_phone: m.from,
                      appointment_id: r.appointment_id ?? null,
                      acao: r.acao,
                      // O texto ja vem decidido pelo banco. O n8n so entrega
                      // e registra -- nao ha o que interpretar do outro lado.
                      resposta: r.resposta,
                    }),
                  })
                } else if (r.resposta && !N8N_LEMBRETE_URL) {
                  console.error('N8N_LEMBRETE_RESPOSTA_URL nao configurada')
                }
                continue
              }
            }
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
              // Quando vem preenchido, o n8n baixa a mídia pela API e transcreve
              // ou descreve antes de entregar ao agente.
              media_id,
              // texto | botao | audio | imagem | video | documento. O agente
              // trata diferente uma confirmação vinda de botão e uma frase solta.
              tipo,
              // Nulo na esmagadora maioria das mensagens. Ver contextoLembrete.
              contexto: contextoLembrete,
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
