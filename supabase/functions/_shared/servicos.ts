/**
 * Os serviços pedidos pelo cliente, resolvidos contra o catálogo REAL do salão.
 *
 * POR QUE ELE EXISTE. Corte + barba num agendamento só já era possível no
 * balcão desde a migration 0120, que criou `appointment_services` e deixou
 * escrito: "Fase 2 (fora daqui): agente e QR público seguem marcando UM
 * serviço". Isto é a fase 2 do QR (decisão do dono, 13/09/2026).
 *
 * MORA EM `_shared` PARA TER TESTE. As edges rodam em Deno e o `index.ts` de
 * cada uma não é alcançado pelo vitest; `_shared` é código puro, sem nada do
 * Deno, e está no `include` do `vitest.config.ts`. A regra aqui decide quanto
 * tempo de cadeira é reservado — é o último lugar do projeto onde vale confiar
 * em leitura de código no lugar de teste.
 *
 * NADA DO QUE O CLIENTE MANDA É CRIDO. Preço e duração saem do banco, nunca do
 * corpo da requisição — senão bastaria pedir um corte de 5 minutos para ocupar
 * a cadeira por uma hora pagando por cinco. A lista de ids é cruzada com os
 * serviços ATIVOS daquele salão, e o que não casar simplesmente não entra.
 */

export type ServicoDoSalao = { id: string; duracao_minutos: number }

/**
 * A lista final, na ordem em que a pessoa escolheu.
 *
 * ORDEM PRESERVADA porque ela vira `appointment_services.ordem` e decide qual é
 * o **principal** — o `service_id` da linha-mãe, que é o que a agenda do CRM, a
 * fatura e o histórico do cliente leem quando leem um serviço só.
 *
 * REPETIÇÃO DESCARTADA, e este é o caso perigoso: a chave primária da filha é
 * (appointment_id, service_id), então o banco engoliria a segunda linha em
 * silêncio — mas a duração somada aqui já teria reservado o dobro. O cliente
 * ficaria com meia hora de cadeira vazia paga por ele, e a barbearia sem o
 * encaixe seguinte.
 *
 * `servicoId` (singular) continua aceito: a edge sobe minutos antes de a Vercel
 * terminar o build, e nesse intervalo a tela antiga só sabe mandar um.
 */
export function servicosPedidos(
  body: Record<string, unknown>,
  catalogo: ServicoDoSalao[],
): ServicoDoSalao[] {
  const brutos = Array.isArray(body.servicoIds) ? (body.servicoIds as unknown[]) : [body.servicoId]
  const vistos = new Set<string>()
  const escolhidos: ServicoDoSalao[] = []
  for (const bruto of brutos) {
    if (typeof bruto !== 'string' || vistos.has(bruto)) continue
    const achado = catalogo.find((s) => s.id === bruto)
    if (!achado) continue
    vistos.add(bruto)
    escolhidos.push(achado)
  }
  return escolhidos
}

/** Os minutos que a cadeira fica ocupada. É o número que vai para
 *  `horarios_livres` E para o `data_hora_fim` do agendamento. */
export const somaDuracao = (servicos: ServicoDoSalao[]) =>
  servicos.reduce((total, s) => total + s.duracao_minutos, 0)
