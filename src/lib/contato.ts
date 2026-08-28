/**
 * Canais públicos do Club Cut, num lugar só.
 *
 * O rodapé e qualquer página futura leem daqui. Canal sem valor real fica
 * `null` e simplesmente não aparece — nunca inventar um número de WhatsApp ou
 * um e-mail que não existe só para o rodapé parecer completo: alguém VAI
 * escrever para ele.
 *
 * Quando o canal oficial existir, preencha aqui e ele aparece sozinho.
 */
export const CONTATO = {
  /** Número do WhatsApp de suporte, só dígitos com DDI (ex.: '5541999990000'). */
  whatsapp: '5541987275895' as string | null,
  /** E-mail de suporte (ex.: 'suporte@clubcut.com.br'). */
  email: 'contato@aurastudioai.com.br' as string | null,
  /** Perfil do Instagram, sem @ (ex.: 'clubcut.app'). */
  instagram: 'auraiagency' as string | null,
}
