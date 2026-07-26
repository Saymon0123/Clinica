/**
 * Endereço público do CRM, usado em links que saem para fora (convite de
 * barbeiro, redefinição de senha).
 *
 * Não dá para confiar em `window.location.origin`: quem administra costuma
 * abrir o app por uma URL de deployment da Vercel
 * (`clinica-<hash>-<conta>.vercel.app`), que fica atrás da proteção da
 * plataforma. O link herdaria esse endereço e quem recebesse cairia na tela
 * de login da Vercel em vez do convite.
 *
 * Configure VITE_APP_URL com o domínio de produção. Sem ele, cai no origin
 * atual — que funciona em desenvolvimento e no domínio certo.
 */
const configurada = import.meta.env.VITE_APP_URL as string | undefined

export const APP_URL = (configurada?.trim() || window.location.origin).replace(/\/+$/, '')

export function urlDoConvite(token: string) {
  return `${APP_URL}/convite/${token}`
}

export function urlDeRedefinicaoDeSenha() {
  return `${APP_URL}/redefinir-senha`
}
