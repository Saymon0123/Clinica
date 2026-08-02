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

export type ErroDeLogin = {
  code?: string | null
  status?: number | null
  message?: string | null
} | null

/**
 * Traduz a falha de login para uma mensagem que aponta para a causa certa.
 *
 * Existe porque o `signIn` respondia "E-mail ou senha inválidos" para
 * **qualquer** erro. Em 2026-08-02 a `VITE_SUPABASE_ANON_KEY` publicada na
 * Vercel estava vencida: o Supabase devolvia `401 Invalid API key`, ninguém
 * conseguia entrar, e a tela acusava a senha do usuário. O dono trocou a senha,
 * pediu recuperação e continuou sem entrar — porque o problema nunca esteve na
 * credencial dele.
 *
 * A distinção que importa é entre "o que você digitou está errado" (o usuário
 * resolve) e "o aplicativo não consegue falar com o servidor" (só o
 * administrador resolve). Confundir as duas custa horas de investigação no
 * lugar errado.
 */
export function mensagemDeErroDeLogin(erro: ErroDeLogin): string {
  if (!erro) return 'Não foi possível entrar. Tente novamente.'

  const mensagem = erro.message ?? ''

  // Chave de API inválida ou ausente: é configuração de ambiente, nunca culpa
  // de quem está tentando entrar.
  if (/invalid api key|no api key/i.test(mensagem)) {
    return 'O aplicativo não conseguiu se identificar no servidor. É um problema de configuração, não da sua senha — avise o administrador.'
  }

  if (/failed to fetch|network|load failed/i.test(mensagem)) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.'
  }

  if (erro.status === 429 || /rate limit|too many/i.test(mensagem)) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  }

  if (erro.code === 'email_not_confirmed' || /email not confirmed/i.test(mensagem)) {
    return 'Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos.'
  }

  if (erro.code === 'invalid_credentials' || /invalid login credentials/i.test(mensagem)) {
    return 'E-mail ou senha inválidos.'
  }

  // Erro desconhecido não vira acusação à senha: diz que é do lado do servidor
  // e devolve a mensagem original para o suporte ter por onde começar.
  return `Não foi possível entrar. ${mensagem || 'Tente novamente em instantes.'}`
}
