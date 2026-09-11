/**
 * O telefone, do jeito que as edge functions precisam checar — nascido do A11
 * do giro de 10/09: o WhatsApp da barbearia não pode mais ficar vazio.
 *
 * A mesma régua do projeto inteiro: 10 a 13 dígitos, ignorando a máscara. Do
 * lado do banco são as CHECKs `clients_telefone_valido` (0128) e
 * `salons_telefone_valido` (0155), via `private.telefone_valido`; do lado da
 * tela, `src/lib/telefone.ts`. Edge function não importa de `src/`, então a
 * cópia das edges mora aqui, uma só para todas.
 */
export const TELEFONE_MIN_DIGITOS = 10
export const TELEFONE_MAX_DIGITOS = 13

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function telefoneValido(valor: string | null | undefined): boolean {
  const n = somenteDigitos(valor).length
  return n >= TELEFONE_MIN_DIGITOS && n <= TELEFONE_MAX_DIGITOS
}

/**
 * A frase para quando o WhatsApp da barbearia falta ou não serve. Diz para que
 * ele existe: sem isso parece burocracia de cadastro — e ele é a única saída
 * do cliente que não consegue marcar pelo QR.
 */
export const AVISO_WHATSAPP_DA_BARBEARIA =
  `Informe o WhatsApp da barbearia com DDD (${TELEFONE_MIN_DIGITOS} a ${TELEFONE_MAX_DIGITOS} dígitos) — ` +
  'é o botão "Falar com a barbearia" que o cliente vê na agenda pelo QR.'
