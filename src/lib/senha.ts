/**
 * Senha mínima num lugar só (passo 4.6 da revisão de 01/09).
 *
 * Criar conta e aceitar convite pediam 8; recuperar e redefinir pediam 6 — o
 * dono criava com 8 e, no dia seguinte, reduzia a própria senha pela tela de
 * recuperação. O mínimo do painel do Supabase Auth deve concordar com este
 * número (item do backlog, fora do repositório).
 */
export const SENHA_MINIMA = 8

export const AVISO_SENHA_CURTA = `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
