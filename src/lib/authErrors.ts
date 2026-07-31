/**
 * Reconhece o erro de sessão expirada vindo do PostgREST.
 *
 * Sem isso, o `SalonProvider` engolia qualquer falha da consulta e assumia
 * "usuário sem vínculo". O dono que deixasse a aba aberta a noite toda abria de
 * manhã e lia "Sua conta ainda não está vinculada a um salão. Fale com o
 * administrador do sistema" — sendo ele o administrador. Parecia perda de dados.
 *
 * O código `PGRST303` é o do PostgREST para JWT vencido. A mensagem é checada
 * junto porque o `code` nem sempre chega em erros de rede intermediários.
 */
export type ErroSupabase = {
  code?: string | null
  message?: string | null
} | null

export function sessaoExpirou(erro: ErroSupabase): boolean {
  if (!erro) return false
  if (erro.code === 'PGRST303') return true
  return /jwt (expired|is expired)/i.test(erro.message ?? '')
}
