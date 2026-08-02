#!/usr/bin/env node
/**
 * Reaplica a configuração padrão em TODAS as instâncias já existentes na
 * Evolution API — settings (principalmente `groupsIgnore`) e eventos do
 * webhook (MESSAGES_UPSERT + SEND_MESSAGE).
 *
 * A edge function `whatsapp` já faz isso quando o dono conecta pelo CRM. Este
 * script existe para o backfill: instâncias criadas antes dessa mudança, ou
 * criadas direto no painel da Evolution, que ninguém vai reconectar tão cedo.
 *
 * Uso (as credenciais ficam no seu ambiente, nunca no repositório):
 *
 *   EVOLUTION_API_URL=https://... \
 *   EVOLUTION_API_KEY=... \
 *   N8N_WEBHOOK_URL=https://... \
 *   node scripts/evolution-aplicar-config.mjs
 *
 * Sem alterar nada, só listando o que faria:
 *
 *   node scripts/evolution-aplicar-config.mjs --dry-run
 */

import config from '../supabase/functions/_shared/evolutionConfig.json' with { type: 'json' }

const API_URL = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '')
const API_KEY = process.env.EVOLUTION_API_KEY
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL
const DRY_RUN = process.argv.includes('--dry-run')

if (!API_URL || !API_KEY) {
  console.error('Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no ambiente.')
  process.exit(1)
}

async function evo(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: API_KEY, ...(init.headers ?? {}) },
  })
  const texto = await res.text()
  let data = null
  try {
    data = texto ? JSON.parse(texto) : null
  } catch {
    data = texto
  }
  return { ok: res.ok, status: res.status, data }
}

const listagem = await evo('/instance/fetchInstances')
if (!listagem.ok) {
  console.error('Não foi possível listar as instâncias:', listagem.status, listagem.data)
  process.exit(1)
}

// A Evolution v2 devolve um array; conforme a versão, o nome vem em `name` ou
// aninhado em `instance.instanceName`.
const instancias = (Array.isArray(listagem.data) ? listagem.data : [])
  .map((i) => i?.name ?? i?.instanceName ?? i?.instance?.instanceName ?? i?.instance?.name)
  .filter((n) => typeof n === 'string' && n.length > 0)

if (instancias.length === 0) {
  console.log('Nenhuma instância encontrada.')
  process.exit(0)
}

console.log(`${instancias.length} instância(s) encontrada(s).`)
console.log('settings:', JSON.stringify(config.settings))
console.log('eventos :', config.webhookEvents.join(', '))
if (DRY_RUN) console.log('\n--dry-run: nada será alterado.\n')

let falhas = 0

for (const nome of instancias) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${nome}`)
    continue
  }

  const settings = await evo(`/settings/set/${nome}`, {
    method: 'POST',
    body: JSON.stringify(config.settings),
  })

  let webhook = { ok: true, status: 0, data: 'pulado (N8N_WEBHOOK_URL não definido)' }
  if (N8N_WEBHOOK_URL) {
    webhook = await evo(`/webhook/set/${nome}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: N8N_WEBHOOK_URL,
          webhookByEvents: false,
          webhookBase64: true,
          events: config.webhookEvents,
        },
      }),
    })
  }

  const okSettings = settings.ok ? 'settings ok' : `settings FALHOU (${settings.status})`
  const okWebhook = webhook.ok ? 'webhook ok' : `webhook FALHOU (${webhook.status})`
  if (!settings.ok || !webhook.ok) {
    falhas++
    console.error(`  ✗ ${nome} — ${okSettings}, ${okWebhook}`)
    if (!settings.ok) console.error('      ', JSON.stringify(settings.data))
    if (!webhook.ok) console.error('      ', JSON.stringify(webhook.data))
  } else {
    console.log(`  ✓ ${nome} — ${okSettings}, ${okWebhook}`)
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} instância(s) com falha.`)
  process.exit(1)
}
if (!DRY_RUN) console.log('\nConcluído.')
