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
 * **Desde 2026-08-24 o sistema de verdade também cobra por uso** — faixas em
 * `faixas_de_uso` no banco, fechamento mensal na tabela `faturas_de_uso`.
 *
 * **Alinhado às faixas do banco em 2026-08-25.** Este é o preço da PRIMEIRA
 * faixa (1 a 3 barbeiros) da migration 0097 — o que um cliente novo paga de
 * fato. A landing fala "a partir de" porque as faixas DESCEM com o tamanho
 * da equipe (ver `FAIXAS_DE_USO`); anunciar o menor preço como se fosse o
 * de todo mundo seria o "até 70%" que esta página recusa.
 */
export const PRECO_POR_AGENDAMENTO = 0.75

/**
 * As faixas por tamanho de equipe, como a landing pode contá-las.
 *
 * CÓPIA da tabela `faixas_de_uso` (migration 0097): quem cobra é o banco,
 * isto aqui só deixa a página mostrar a escada sem chutar. Se a migration
 * mudar as faixas, mudar aqui junto.
 */
export const FAIXAS_DE_USO = [
  { rotulo: '1 a 3 barbeiros', preco: 0.75 },
  { rotulo: '4 a 7', preco: 0.7 },
  { rotulo: '8 a 10', preco: 0.65 },
  { rotulo: '11 ou mais', preco: 0.6 },
] as const

/** O piso da escada, para o texto "cai até R$0,60" não repetir número solto. */
export const PRECO_MINIMO_POR_AGENDAMENTO = FAIXAS_DE_USO[FAIXAS_DE_USO.length - 1].preco
