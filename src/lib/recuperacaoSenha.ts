/**
 * Detecta o retorno do link de "esqueci minha senha".
 *
 * O Supabase só redireciona para URLs que estejam na lista de permitidas do
 * projeto. Quando a URL pedida não está lá, ele **ignora em silêncio** e manda
 * para a Site URL — que costuma ser a raiz, e a raiz sem sessão cai no login.
 * O usuário clica no e-mail e aparece a tela de entrar, sem explicação.
 *
 * Os tokens continuam vindo no fragmento da URL. Reconhecê-los aqui permite
 * levar a pessoa para a tela certa mesmo com a configuração errada.
 *
 * O caminho principal hoje é o **código de 6 dígitos** (ver ForgotPasswordPage),
 * que não depende de redirecionamento nenhum. Isto aqui cobre quem ainda
 * receber um link antigo.
 */

/**
 * Fragmento da URL como estava quando o app carregou.
 *
 * Capturado no carregamento do módulo de propósito: o supabase-js consome e
 * limpa o hash de forma assíncrona logo depois, e a navegação do React Router
 * também o descarta. Quem olhar `window.location.hash` dentro de um componente
 * já não encontra nada — foi assim que a primeira versão desta correção falhou.
 */
const HASH_DE_ENTRADA = typeof window !== 'undefined' ? window.location.hash : ''

export function hashDeEntrada(): string {
  return HASH_DE_ENTRADA
}

export function hashIndicaRecuperacao(hash: string | null | undefined): boolean {
  if (!hash) return false
  // O fragmento vem como "#access_token=...&type=recovery&..."
  const conteudo = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(conteudo)
  return params.get('type') === 'recovery'
}

/**
 * Traduz o erro que o Supabase devolve no fragmento quando o link falha.
 *
 * Um link vencido volta como `#error=access_denied&error_code=otp_expired`.
 * Sem tratar isso, o usuário clica no e-mail, cai no login e não recebe
 * explicação nenhuma — parece que o sistema simplesmente ignorou o clique.
 */
export function mensagemDeErroDoRetorno(hash: string | null | undefined): string | null {
  if (!hash) return null
  const conteudo = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(conteudo)

  const codigo = params.get('error_code')
  const erro = params.get('error')
  if (!codigo && !erro) return null

  if (codigo === 'otp_expired') {
    return 'Esse link expirou. Peça um novo código abaixo.'
  }
  if (erro === 'access_denied') {
    return 'Esse link não é mais válido. Pode já ter sido usado. Peça um novo código abaixo.'
  }
  return 'Não foi possível usar esse link. Peça um novo código abaixo.'
}

/**
 * Limpa o código digitado antes de mandar para o Supabase.
 *
 * Quem copia do e-mail costuma trazer espaço, quebra de linha ou traço no meio
 * ("123 456", "123-456"). O Supabase compara o texto exato e devolveria
 * "código inválido" para um código que está certo.
 */
export function normalizarCodigo(bruto: string): string {
  return (bruto ?? '').replace(/\D/g, '')
}

/** O código do Supabase tem 6 dígitos. */
export function codigoPareceValido(bruto: string): boolean {
  return normalizarCodigo(bruto).length === 6
}
