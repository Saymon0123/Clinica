/**
 * Prazo do teste grátis.
 *
 * Estava escrito à mão em sete lugares — dois wizards, a tela de criar conta,
 * os termos de uso e três textos de interface. Trocar de 7 para 14 exigiria
 * lembrar de todos, e o primeiro esquecido faria a tela prometer um prazo
 * diferente do que o sistema concede.
 *
 * **Por que 14 e não 7.** O valor do produto aparece quando o cliente *volta*:
 * quando um lembrete evita uma falta, quando a agenda enche sozinha. Numa
 * barbearia média isso leva mais de uma semana. Como o agente roda em
 * gpt-4o-mini, dobrar o prazo custa centavos por barbearia — e o teto de uso
 * da migration 0052 protege o caso extremo.
 *
 * O servidor tem a própria cópia em `criar-minha-barbearia`, porque edge
 * function não importa de `src/`. Ao mudar aqui, mudar lá.
 */
export const DIAS_DE_TESTE = 14

/** Validade do link de convite. Vive em `admin-invite-salon`; repetido aqui só
 *  para a tela poder dizer o prazo sem chutar. */
export const DIAS_DE_VALIDADE_DO_CONVITE = 10
