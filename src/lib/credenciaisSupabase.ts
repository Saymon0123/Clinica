/**
 * Valida as credenciais do Supabase antes de montar o cliente.
 *
 * Existe por causa de 2026-08-02: a `VITE_SUPABASE_ANON_KEY` publicada na
 * Vercel era `eyJhbGci` seguido de **200 bolinhas** (`•`, U+2022). A chave
 * tinha sido copiada do campo mascarado do painel — veio o que estava
 * desenhado na tela, não o valor.
 *
 * O sintoma não ajudava em nada: o navegador recusava a requisição com
 * "Failed to read the 'headers' property from 'RequestInit': String contains
 * non ISO-8859-1 code point", porque header HTTP só aceita Latin-1 e `•` está
 * fora. Ninguém conseguia entrar, e a tela de login acusava a senha do usuário.
 *
 * Uma variável de ambiente errada deve falhar dizendo o que está errado, no
 * momento em que o app sobe — não virar erro de header na primeira tentativa
 * de login.
 */

/** Formato de chave que o Supabase aceita hoje. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const PUBLICAVEL = /^sb_publishable_[A-Za-z0-9_-]+$/

export function problemaNaChave(chave: string): string | null {
  const mascarada = /[•·●∙*]/.test(chave)
  if (mascarada) {
    return (
      'A chave contém caracteres de máscara (•). Ela foi copiada do campo ' +
      'escondido do painel, então veio o desenho da tela em vez do valor. ' +
      'Revele a chave antes de copiar.'
    )
  }

  // Header HTTP é Latin-1: qualquer coisa acima disso quebra o fetch antes de
  // a requisição sair, com uma mensagem que não menciona a chave.
  const forasteiro = [...chave].find((c) => c.charCodeAt(0) > 0xff)
  if (forasteiro) {
    const ponto = forasteiro.codePointAt(0)!.toString(16).toUpperCase()
    return `A chave contém o caractere U+${ponto}, que não é válido em cabeçalho HTTP. Provavelmente veio de uma cópia com formatação.`
  }

  if (/\s/.test(chave)) {
    return 'A chave contém espaço ou quebra de linha. Copie o valor inteiro, sem espaços nas pontas.'
  }

  if (!JWT.test(chave) && !PUBLICAVEL.test(chave)) {
    return 'A chave não tem o formato esperado (nem JWT `xxx.yyy.zzz`, nem `sb_publishable_...`). Confira se copiou o valor completo.'
  }

  return null
}

export function problemaNaUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return `"${url}" não é uma URL válida. Esperado algo como https://<projeto>.supabase.co`
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    return 'A URL do Supabase precisa ser https.'
  }
  return null
}
