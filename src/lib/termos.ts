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
// 2026-08-14: o prazo do teste passou de 7 para 14 dias, e a cláusula 3 mudou
// junto. Quem aceitou a versão anterior continua com o registro dela — é essa
// diferença que permite saber, depois, quem precisa aceitar de novo.
export const VERSAO_DOS_TERMOS = '2026-08-14'

/**
 * O texto ainda não passou por advogado.
 *
 * Enquanto isto for `true`, as telas avisam. A máquina de aceite é a mesma —
 * ela existe justamente para que trocar o texto depois seja trocar uma versão,
 * e não refazer o sistema.
 */
export const TERMOS_EM_REVISAO = true
