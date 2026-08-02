#!/usr/bin/env node
/**
 * Remove instâncias da Evolution API.
 *
 * Apagar a barbearia no banco **não** remove a instância no servidor Evolution:
 * ela continua existindo, conectada e consumindo recurso, sem nenhuma barbearia
 * correspondente. Este script fecha essa ponta.
 *
 * Sem argumentos, lista o que existe e não altera nada:
 *
 *   node scripts/evolution-remover-instancias.mjs
 *
 * Com nomes, faz logout e apaga cada uma:
 *
 *   node scripts/evolution-remover-instancias.mjs salon-abc... salon-def...
 *
 * Use `--todas` para remover tudo que estiver no servidor.
 */

const API_URL = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '')
const API_KEY = process.env.EVOLUTION_API_KEY

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

const existentes = (Array.isArray(listagem.data) ? listagem.data : [])
  .map((i) => i?.name ?? i?.instanceName ?? i?.instance?.instanceName ?? i?.instance?.name)
  .filter((n) => typeof n === 'string' && n.length > 0)

const args = process.argv.slice(2)
const todas = args.includes('--todas')
const pedidas = args.filter((a) => !a.startsWith('--'))

if (!todas && pedidas.length === 0) {
  console.log(`${existentes.length} instância(s) no servidor:`)
  for (const nome of existentes) console.log('  -', nome)
  console.log('\nNada foi alterado. Passe os nomes a remover, ou --todas.')
  process.exit(0)
}

const alvos = todas ? existentes : pedidas
const inexistentes = alvos.filter((a) => !existentes.includes(a))
if (inexistentes.length > 0) {
  console.log('Já não existem no servidor (serão ignoradas):')
  for (const nome of inexistentes) console.log('  -', nome)
}

let falhas = 0
for (const nome of alvos.filter((a) => existentes.includes(a))) {
  // Logout antes de apagar: a instância conectada mantém sessão do WhatsApp, e
  // o delete direto pode deixar resíduo do lado do Baileys.
  await evo(`/instance/logout/${nome}`, { method: 'DELETE' })
  const del = await evo(`/instance/delete/${nome}`, { method: 'DELETE' })
  if (del.ok) {
    console.log(`  ✓ ${nome} removida`)
  } else {
    falhas++
    console.error(`  ✗ ${nome} — falhou (${del.status})`, JSON.stringify(del.data))
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} instância(s) com falha.`)
  process.exit(1)
}
console.log('\nConcluído.')
