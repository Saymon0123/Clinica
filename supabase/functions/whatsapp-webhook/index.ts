import { createClient } from 'jsr:@supabase/supabase-js@2'
import { capturarErro, comSentry } from '../_shared/sentry.ts'
import { ehPedidoDeSaida } from '../_shared/optOut.ts'
import type { ClienteAdmin } from '../_shared/supabase.ts'
import { marcarSalao } from '../_shared/log.ts'

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
 *
 * **E é por isso que a mensagem é gravada antes de ser entregue** (0162): como
 * respondemos 200 sempre, a Meta nunca reenvia por conta própria, e a única
 * retentativa possível é a nossa. `mensagens_recebidas` guarda o que o cliente
 * escreveu antes do POST ao agente; `mensagens_a_entregar` é a fila de quem não
 * chegou lá.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''
const N8N_WEBHOOK_URL = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL') ?? ''
const N8N_LEMBRETE_URL = Deno.env.get('N8N_LEMBRETE_RESPOSTA_URL') ?? ''
// Segredo compartilhado do webhook do n8n (header X-Webhook-Token). Vai em todo
// POST ao n8n; o webhook do n8n exige que bata (item 4 — auth da entrada).
const WEBHOOK_TOKEN = Deno.env.get('N8N_WEBHOOK_TOKEN') ?? ''



/**
 * Entrega ao n8n e CONFERE que chegou.
 *
 * Os POSTs deste arquivo carregam a resposta que o cliente vai ler, e três deles
 * não checavam nada. O efeito era cruel: quando o n8n devolvia 500, **o banco já
 * tinha gravado e não dava para desfazer** — `responder_lembrete` casa por wamid
 * e consome a idempotência ali. Se o cliente clicasse de novo, a RPC devolvia
 * `'repetido'` com `resposta: null` e a edge nem postava. O silêncio virava
 * definitivo: ele confirmou a presença e nunca ouviu nada.
 *
 * E ninguém ficava sabendo — 500 do n8n não é `throw`, então o Sentry não via.
 *
 * Isto **não recupera** a resposta: converte invisível em visível, para o dono
 * poder ligar para o cliente. A fila de ENTRADA — a mensagem que o cliente
 * escreve — passou a existir na 0162; esta, a de SAÍDA, ainda não tem, e
 * continua sendo o outro lado do achado A3.
 */
async function entregarAoN8n(corpo: Record<string, unknown>, onde: string): Promise<boolean> {
  if (!N8N_LEMBRETE_URL) return false
  try {
    const resposta = await fetch(N8N_LEMBRETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Token': WEBHOOK_TOKEN },
      body: JSON.stringify(corpo),
    })
    if (resposta.ok) return true
    console.error('n8n recusou a entrega:', onde, resposta.status)
    await capturarErro(new Error(`n8n ${resposta.status} em ${onde}`), 'whatsapp-webhook', {
      onde,
      contato: String(corpo.contact_phone ?? ''),
      acao: String(corpo.acao ?? ''),
    })
    return false
  } catch (err) {
    // Rede caindo no meio precisa parar AQUI. Sem este catch, a exceção sobe e
    // derruba o processamento das outras mensagens do mesmo lote — uma falha
    // vira várias.
    console.error('Falha de rede ao entregar ao n8n:', onde, err)
    await capturarErro(err, 'whatsapp-webhook', { onde, contato: String(corpo.contact_phone ?? '') })
    return false
  }
}

type StatusDeEntrega = {
  id?: string
  status?: string
  recipient_id?: string
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]
}

/**
 * O bloco `statuses` — que antes era descartado inteiro nos dois ramos.
 *
 * É o ÚNICO lugar por onde um erro da Meta chega. Sem ler isto, o sistema acha
 * que entregou: o lembrete não chegou, o convite não chegou, e nada muda de cor
 * em lugar nenhum. Você descobre pelo cliente que não apareceu.
 *
 * Só `failed` é gravado. `sent`, `delivered` e `read` chegam para toda mensagem
 * e são volume puro — registrar os quatro encheria a tabela para esconder os
 * que importam.
 */
async function registrarFalhasDeEntrega(
  admin: ClienteAdmin,
  statuses: StatusDeEntrega[],
  phoneNumberId: string,
) {
  for (const s of statuses) {
    if (s.status !== 'failed' || !s.id) continue
    const erro = s.errors?.[0]
    const { error } = await admin.rpc('registrar_entrega_falhada', {
      p_message_id: s.id,
      p_destino: s.recipient_id ?? 'desconhecido',
      p_codigo: erro?.code ?? null,
      p_titulo: erro?.title ?? null,
      p_detalhe: erro?.error_data?.details ?? erro?.message ?? null,
      p_phone_number_id: phoneNumberId,
    })
    if (error) {
      console.error('Erro ao registrar entrega falhada:', error.message, s.id)
      await capturarErro(error, 'whatsapp-webhook', { onde: 'registrar-entrega-falhada' })
      continue
    }
    console.log('entrega falhada:', s.id, 'para', s.recipient_id, 'codigo', erro?.code ?? '?')

    // Códigos de CONTA, não de destinatário: não adianta o dono conferir o
    // telefone do cliente porque o problema é do outro lado. Esses sobem ao
    // Sentry, que é onde eu olho.
    const daConta = [131031, 133000, 133004, 133005, 133006, 368, 131056]
    if (erro?.code && daConta.includes(erro.code)) {
      await capturarErro(
        new Error(`Meta bloqueou o envio: ${erro.code} ${erro.title ?? ''}`),
        'whatsapp-webhook',
        { onde: 'conta-bloqueada', codigo: erro.code, phoneNumberId },
      )
    }
  }
}

/** Limite de tentativas via banco (0111). Erro do limitador deixa passar. */
async function taxaExcedida(
  admin: ClienteAdmin,
  chave: string,
  limite: number,
  janelaSegundos: number,
) {
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

/** Número no formato do wa.me: só dígitos, com o 55 na frente. */
function linkDoWhatsapp(telefone: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10 || digitos.length > 13) return null
  return `https://wa.me/${digitos.startsWith('55') ? digitos : `55${digitos}`}`
}

/**
 * Texto solto no número central: responde apontando o caminho, em vez de calar.
 *
 * O silêncio de antes tinha custo real. O template pergunta "você vem?"; o
 * cliente DIGITA "pode cancelar" em vez de tocar no botão — e nada acontecia. O
 * horário seguia marcado, o dono não sabia, a cadeira ficava vazia. E o pior
 * caso era "quem é?", de alguém que recebeu de um número desconhecido: ignorar
 * isso vira denúncia, e este número carrega os lembretes de TODAS as barbearias.
 *
 * Não entrega ao agente de propósito: o agente mora no número da barbearia, e
 * escolher uma barbearia arbitrária mandaria a conversa para a loja errada. A
 * RPC descobre a certa quando dá, e devolve nada quando não dá — aí a resposta
 * é genérica, que é honesto, não preguiçoso.
 */
async function responderForaDeContexto(
  admin: ClienteAdmin,
  telefone: string,
  phoneNumberId: string,
  messageId: string | null,
) {
  // Sem freio, dois auto-respondedores conversando entre si viram um loop que
  // a Meta cobra e depois pune.
  if (await taxaExcedida(admin, `central-fora:${telefone}`, 3, 3600)) {
    console.log('resposta fora de contexto silenciada pelo limite:', telefone)
    return
  }

  const { data, error } = await admin.rpc('barbearia_para_contato_central', {
    p_telefone: telefone,
    p_message_id: messageId,
  })
  if (error) {
    console.error('barbearia_para_contato_central falhou:', error.message)
    await capturarErro(error, 'whatsapp-webhook', { onde: 'barbearia_para_contato_central' })
    return
  }

  const barbearia = (Array.isArray(data) ? data[0] : null) as
    | { salon_id: string; nome: string; telefone: string | null; quantas: number }
    | null
  const link = barbearia ? linkDoWhatsapp(barbearia.telefone) : null

  const abertura = 'Oi! Este numero so envia avisos automaticos e nao e atendido por aqui.'
  let resposta: string
  if (barbearia && link) {
    resposta = `${abertura} Para marcar, mudar ou cancelar um horario, fale com a ${barbearia.nome} aqui: ${link}`
    // Cliente de mais de uma barbearia: afirmar qual é seria chute com cara de
    // certeza. Melhor oferecer a mais provável e admitir que pode ser outra.
    if (barbearia.quantas > 1) {
      resposta += ' Se for sobre outra barbearia, fale com ela direto.'
    }
  } else if (barbearia) {
    // A barbearia existe e não tem telefone cadastrado — o buraco que também
    // apaga o "fale com a barbearia" da agenda pública.
    resposta = `${abertura} Para marcar, mudar ou cancelar um horario, fale direto com a ${barbearia.nome}.`
  } else {
    resposta = `${abertura} Para marcar, mudar ou cancelar um horario, fale direto com a sua barbearia.`
  }

  await entregarAoN8n(
    {
      // O salon_id vai preenchido quando dá: o fluxo do n8n usa esse campo para
      // achar a conversa e registrar a mensagem.
      salon_id: barbearia?.salon_id ?? null,
      phone_number_id: phoneNumberId,
      contact_phone: telefone,
      appointment_id: null,
      acao: 'fora_de_contexto',
      resposta,
    },
    'resposta-fora-de-contexto',
  )
}

/**
 * Registra o opt-out e AVISA a pessoa que parou.
 *
 * O aviso não é cortesia: quem pede para sair e recebe silêncio não sabe se
 * funcionou, e a próxima mensagem nossa — mesmo legítima — vira denúncia. Num
 * número central que carrega os avisos de todas as barbearias, denúncia é o que
 * derruba a base inteira.
 *
 * A resposta livre é permitida aqui sem template: a pessoa acabou de escrever,
 * então a janela de atendimento de 24h está aberta.
 */
async function registrarSaida(
  admin: ClienteAdmin,
  telefone: string,
  phoneNumberId: string,
) {
  const { data: fichas, error } = await admin.rpc('marcar_opt_out', { p_telefone: telefone })
  if (error) {
    console.error('marcar_opt_out falhou:', error.message)
    await capturarErro(error, 'whatsapp-webhook', { onde: 'marcar_opt_out' })
    return
  }
  console.log('opt-out registrado, fichas marcadas:', fichas ?? 0)

  // O opt-out no banco já valeu; o que pode faltar é o aviso.
  await entregarAoN8n(
    {
      salon_id: null,
      phone_number_id: phoneNumberId,
      contact_phone: telefone,
      appointment_id: null,
      acao: 'opt_out',
      resposta:
        'Pronto! Voce nao vai mais receber nossas mensagens de convite. ' +
        'Se marcar um horario, o lembrete dele continua chegando. ' +
        'Mudou de ideia? E so falar com a sua barbearia.',
    },
    'aviso-opt-out',
  )
}

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

Deno.serve(comSentry('whatsapp-webhook', async (req, ctx) => {
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

        // Eventos administrativos da WABA (phone_number_quality_update,
        // account_update...) não são conversa: são a Meta avisando sobre a
        // saúde do número central — que carrega os lembretes de TODAS as
        // barbearias. Grava e a auditoria transforma em alerta.
        if (mudanca.field && mudanca.field !== 'messages') {
          const { error: erroEvento } = await admin
            .from('eventos_da_waba')
            .insert({ campo: mudanca.field, evento: valor })
          if (erroEvento) console.error('Erro ao gravar evento da WABA:', erroEvento)
          continue
        }

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
        // Um POST da Meta pode trazer mensagens de barbearias diferentes, porque
        // o numero central atende todas. Marcando dentro do laco, a linha de fim
        // diz o id quando foi uma so e `varios` quando foram mais -- e nunca
        // atribui a conversa de uma barbearia a outra.
        marcarSalao(ctx, salonId as string | null)
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
          // Status de entrega: não é conversa, mas também não é lixo. Lembrete,
          // avaliação e reativação saem TODOS por este número — é aqui que se
          // descobre que não chegaram.
          if (valor.statuses?.length) {
            await registrarFalhasDeEntrega(admin, valor.statuses as StatusDeEntrega[], phoneNumberId)
            continue
          }

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
              // Não era lembrete: pode ser o clique da pesquisa de avaliação,
              // que sai pelo mesmo número central (regra de 01/09: toda
              // conversa iniciada por nós vai pela oficial). Mesma mecânica —
              // o banco decide pelo wamid e devolve o texto pronto.
              if (!r?.atendido) {
                const { data: av, error: erroAv } = await admin.rpc('responder_avaliacao', {
                  p_message_id: m.context.id,
                  p_botao: texto,
                })
                if (erroAv) {
                  console.error('responder_avaliacao falhou:', erroAv.message)
                  continue
                }
                if (av?.atendido && av.resposta) {
                  // O mais caro dos três: aqui vai junto o `avisar_dono` de nota
                  // baixa. Falhar em silêncio some com o agradecimento E com o
                  // alerta — o cliente dá nota 1 e o dono nunca fica sabendo.
                  await entregarAoN8n(
                    {
                      salon_id: av.salon_id ?? null,
                      phone_number_id: phoneNumberId,
                      contact_phone: m.from,
                      appointment_id: null,
                      acao: 'avaliacao',
                      nota: av.nota ?? null,
                      // Nota baixa: o fluxo avisa o dono no canal de alertas.
                      avisar_dono: av.avisar_dono === true,
                      resposta: av.resposta,
                    },
                    'resposta-avaliacao',
                  )
                } else if (!av?.atendido) {
                  // Nem lembrete nem avaliação: é aqui que cai o botão "Nao
                  // quero mais receber" dos templates de reativação. Ele chega
                  // com `context.id` do convite, mas nenhuma das duas RPCs o
                  // reconhece — e por isso morria neste `console.error`,
                  // deixando o opt-out de LGPD sem nenhuma escrita no sistema.
                  if (ehPedidoDeSaida(texto)) {
                    await registrarSaida(admin, m.from, phoneNumberId)
                  } else {
                    console.error('clique no numero central sem lembrete nem avaliacao:',
                      m.context.id, 'de:', m.from)
                  }
                }
                continue
              }
              if (r.atendido && (r.resposta || r.entregar_ao_agente)) {
                // Reagendar no número central NÃO vai ao agente: o agente mora
                // no número da barbearia (Evolution). O fluxo de resposta troca
                // entregar_ao_agente pelo convite com o wa.me da barbearia —
                // falhar aqui deixa quem clicou em "Reagendar" sem saber COMO.
                await entregarAoN8n(
                  {
                    salon_id: r.salon_id ?? null,
                    phone_number_id: phoneNumberId,
                    contact_phone: m.from,
                    appointment_id: r.appointment_id ?? null,
                    acao: r.entregar_ao_agente ? 'reagendar_central' : r.acao,
                    resposta: r.resposta ?? null,
                  },
                  'resposta-lembrete-central',
                )
              }
              continue
            }

            // "PARAR" escrito à mão vale tanto quanto o botão. Quem responde ao
            // convite digitando em vez de tocar não pediu menos para sair —
            // e mandar de novo depois disso é o que vira denúncia.
            if (ehPedidoDeSaida(texto)) {
              await registrarSaida(admin, m.from, phoneNumberId)
              continue
            }

            // Texto solto no número de avisos. Antes morria aqui num
            // `console.error` — o cliente escrevia e ninguém do outro lado.
            // Agora aponta o caminho: nunca um salão arbitrário, mas também
            // nunca silêncio.
            console.log('mensagem sem contexto no numero central, de:', m.from, 'tipo:', tipo)
            await responderForaDeContexto(admin, m.from, phoneNumberId, m.context?.id ?? null)
          }
          continue
        }

        // Status de entrega (enviado, lido, falhou) chega no mesmo webhook das
        // mensagens. Não é conversa — o agente não deve ser acordado por isso —
        // mas o `failed` é registrado antes de sair.
        if (valor.statuses?.length) {
          await registrarFalhasDeEntrega(admin, valor.statuses as StatusDeEntrega[], phoneNumberId)
          continue
        }

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
                  await entregarAoN8n(
                    {
                      salon_id: salonId,
                      phone_number_id: phoneNumberId,
                      contact_phone: m.from,
                      appointment_id: r.appointment_id ?? null,
                      acao: r.acao,
                      // O texto ja vem decidido pelo banco. O n8n so entrega
                      // e registra -- nao ha o que interpretar do outro lado.
                      resposta: r.resposta,
                    },
                    'resposta-lembrete-barbearia',
                  )
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
          const nomeDoContato = valor.contacts?.[0]?.profile?.name ?? null
          const paraOAgente = {
            salon_id: salonId,
            phone_number_id: phoneNumberId,
            waba_id: entrada.id ?? null,
            contact_phone: m.from,
            contact_name: nomeDoContato,
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
          }

          // GRAVAR ANTES DE ENTREGAR (0162, achado A3). Até aqui a mensagem do
          // cliente só existia neste `fetch`: n8n fora do ar e ela sumia, sem
          // ninguém nunca saber o que ele escreveu. Agora ela vira linha antes
          // de sair, e a fila `mensagens_a_entregar` reentrega o que não chegou.
          //
          // O retorno também resolve a reentrega DA META: quando ela repete o
          // mesmo evento — e ela repete —, `false` diz que já tratamos, e o
          // agente não responde duas vezes à mesma frase.
          const { data: ehNova, error: erroRegistro } = await admin.rpc(
            'registrar_mensagem_recebida',
            {
              p_message_id: m.id,
              p_salon_id: salonId,
              p_phone_number_id: phoneNumberId,
              p_contact_phone: m.from,
              p_contact_name: nomeDoContato,
              p_tipo: tipo,
              p_payload: paraOAgente,
            },
          )
          if (erroRegistro) {
            // Não dá para desistir da mensagem por causa disto: entregar sem
            // registro é melhor do que não entregar. Mas grita, porque daqui em
            // diante a rede de segurança não existe para esta mensagem.
            console.error('Nao foi possivel registrar a mensagem recebida:', erroRegistro.message)
            await capturarErro(erroRegistro, 'whatsapp-webhook', { onde: 'registrar-mensagem' })
          } else if (ehNova === false) {
            console.log('mensagem repetida da Meta, ja tratada:', m.id)
            continue
          }

          const resposta = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Webhook-Token': WEBHOOK_TOKEN },
            body: JSON.stringify(paraOAgente),
          })
          if (resposta.ok) {
            await admin.rpc('marcar_mensagem_entregue', { p_message_id: m.id })
          } else {
            const corpo = await resposta.text()
            console.error('n8n recusou a mensagem:', resposta.status, corpo)
            await admin.rpc('marcar_tentativa_de_entrega', {
              p_message_id: m.id,
              p_erro: `HTTP ${resposta.status}: ${corpo.slice(0, 200)}`,
            })
            // Continua gritando: a fila recupera a mensagem, mas o agente estar
            // recusando entrega é um problema que alguém precisa olhar.
            await capturarErro(new Error(`n8n recusou a mensagem (HTTP ${resposta.status})`), 'whatsapp-webhook', {
              status: resposta.status,
              corpo: corpo.slice(0, 500),
            })
          }
        }
      }
    }
  } catch (erro) {
    // Nunca propaga: ver o cabeçalho sobre por que 200 sempre. Mas registra —
    // era o engolir silencioso mais perigoso do projeto: a Meta recebia 200 e
    // a mensagem do cliente sumia sem rastro.
    console.error('Erro tratando webhook do WhatsApp:', erro)
    await capturarErro(erro, 'whatsapp-webhook')
  }

  return ok()
}))
