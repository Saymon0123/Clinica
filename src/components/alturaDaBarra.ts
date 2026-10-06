/**
 * A altura da barra de um dia no mini-gráfico do `StatsCard`, em porcentagem
 * da faixa.
 *
 * Em módulo próprio, e não dentro do `StatsCard.tsx`, por dois motivos que
 * puxam para o mesmo lado: arquivo que exporta componente E função quebra o
 * fast refresh (o oxlint avisa), e o teste de unidade deste projeto importa de
 * módulo puro — mesma razão de `computePeriods.ts` ter saído do hook.
 *
 * **Zero não desenha nada.** Até 05/10 havia um piso de 6% para toda barra,
 * inclusive a de valor zero — e 6% de uma faixa de 36px é uma barra de 2px.
 * Com o vão de 4px entre elas, uma sequência de dias zerados virava um
 * tracejado rente ao fundo do card: o dono leu aquilo como defeito de
 * renderização, não como informação, e estava certo. Pior que feio: um dia
 * com NENHUM agendamento ficava idêntico a um dia com um só, porque 1 de 40
 * é 2,5% e o piso empurrava os dois para os mesmos 6%.
 *
 * Agora zero é zero — quem diz que o dia existiu é a linha de base embaixo da
 * faixa. O piso de 8% continua, mas só para valor diferente de zero: aí ele
 * garante que um dia de pouco movimento apareça, sem mentir sobre um dia sem
 * movimento nenhum.
 */
export function alturaDaBarra(valor: number, maior: number) {
  if (valor === 0) return '0%'
  return `${Math.max((Math.abs(valor) / maior) * 100, 8)}%`
}
