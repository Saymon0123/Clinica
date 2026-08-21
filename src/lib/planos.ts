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

/**
 * Preço por agendamento confirmado, em reais.
 *
 * A landing trocou de mensalidade fixa (Básico R$197 / Pro R$299) para
 * cobrança 100% por uso em 2026-08-21. O valor mora aqui pela mesma razão de
 * sempre: a página de vendas faz CONTA com ele — a calculadora de preço e a
 * comparação da cadeira vazia — e um número desatualizado ali não seria só
 * texto errado, seria conta errada.
 *
 * **Isto é só a landing.** O sistema de assinatura de verdade
 * (`src/features/assinatura/`, com `AssinaturaPage`, `TrocarPlano` e o
 * cálculo de proporcional) continua cobrando mensalidade fixa hoje, com os
 * próprios valores (R$197/R$299) escritos à parte — ele não importa deste
 * arquivo e não foi tocado nesta mudança. Migrar a cobrança de verdade de
 * mensal para por-uso é trabalho de CRM + Supabase + processador de
 * pagamento, registrado em `docs/backlog.md`, e não acontece sozinho só
 * porque a landing mudou de discurso.
 */
export const PRECO_POR_AGENDAMENTO = 0.85
