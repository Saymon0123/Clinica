/**
 * Contrato de nomeação das instâncias da Evolution API: `salon-<uuid>`.
 *
 * Esta é a única tradução entre um tenant do CRM e uma instância de WhatsApp,
 * e ela atravessa a fronteira do sistema: o CRM produz o nome (ao criar a
 * instância), e o fluxo do n8n faz o caminho inverso — extrai o `salon_id` do
 * nome que chega no webhook da Evolution e usa esse UUID em toda gravação.
 *
 * Do lado do n8n as escritas usam `service_role`, que ignora RLS. Ou seja: se
 * a extração do UUID errar, o banco não impede a gravação no salão errado.
 * Por isso as duas direções vivem aqui juntas e cobertas por teste, em vez de
 * cada ponta reimplementar um `replace('salon-', '')`.
 *
 * Sem dependências de Deno de propósito — assim roda no vitest.
 */

export const INSTANCE_PREFIX = 'salon-'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Nome da instância na Evolution para um salão. Lança se o id não for UUID. */
export function instanceNameFor(salonId: string): string {
  if (!isUuid(salonId)) {
    throw new Error(`salonId inválido para nome de instância: ${JSON.stringify(salonId)}`)
  }
  return `${INSTANCE_PREFIX}${salonId.toLowerCase()}`
}

/**
 * Caminho inverso: extrai o `salon_id` do nome da instância recebido no
 * webhook. Retorna `null` — nunca um palpite — quando o nome não casa com o
 * contrato. Quem chama deve tratar `null` parando o fluxo, jamais seguindo
 * com um salão arbitrário.
 */
export function salonIdFromInstanceName(instanceName: string | null | undefined): string | null {
  if (typeof instanceName !== 'string') return null
  const nome = instanceName.trim()
  if (!nome.startsWith(INSTANCE_PREFIX)) return null
  const candidato = nome.slice(INSTANCE_PREFIX.length)
  return isUuid(candidato) ? candidato.toLowerCase() : null
}
