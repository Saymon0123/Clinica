/**
 * Versão vigente dos termos.
 *
 * O registro do aceite guarda esta string. É ela que liga a pessoa ao texto
 * exato que ela leu — sem versão, mudar os termos reescreveria retroativamente
 * o que todo mundo aceitou.
 *
 * **Ao publicar um texto novo, troque a versão.** Quem aceitou a anterior
 * continua com o registro dela, e passa a haver uma diferença detectável entre
 * o que está no ar e o que cada um aceitou — que é exatamente a informação
 * necessária para decidir quem precisa aceitar de novo.
 *
 * Formato de data para ordenar sozinho e dizer, de bate-pronto, de quando é o
 * texto que a pessoa viu.
 */
// 2026-08-24: o modelo de cobrança mudou de mensalidade por plano para
// cobrança por agendamento (por uso). Caíram as cláusulas de planos e de troca
// de plano; a de preço foi reescrita; e a do WhatsApp deixou de descrever um
// canal não oficial — a conexão passou à API oficial da Meta em 2026-08-22.
// 2026-08-31: modelo híbrido — a cláusula do WhatsApp passou a descrever a
// realidade atual: a conversa acontece no número da barbearia (pareado por QR)
// e os avisos automáticos saem por número do Club Cut na API oficial. Quem
// aceitou versões anteriores continua com o registro delas.
export const VERSAO_DOS_TERMOS = '2026-08-31'

/**
 * O texto ainda não passou por advogado.
 *
 * Enquanto isto for `true`, as telas avisam. A máquina de aceite é a mesma —
 * ela existe justamente para que trocar o texto depois seja trocar uma versão,
 * e não refazer o sistema.
 */
export const TERMOS_EM_REVISAO = true
