/**
 * Datas e períodos num lugar só (passo 4.6 da revisão de 01/09).
 *
 * "Esta semana" começava no domingo na Rede e na segunda no hook da mesma
 * tela; o mês de referência era calculado em horário local num ponto e em
 * UTC em dois outros — entre 21h e a meia-noite do último dia do mês, o
 * dono via dois meses diferentes na mesma página. Tudo aqui é HORÁRIO LOCAL
 * do navegador, que é o do balcão.
 */

/** Meia-noite local do dia. */
export function inicioDoDia(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Segunda-feira, meia-noite. A semana da barbearia começa na segunda. */
export function inicioDaSemana(d: Date = new Date()): Date {
  const inicio = inicioDoDia(d)
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7))
  return inicio
}

/** Dia 1 do mês, meia-noite. */
export function inicioDoMes(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** 'YYYY-MM-DD' local — para comparar com colunas `date` do banco. */
export function chaveDoDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

/** 'YYYY-MM' local. Nunca `toISOString().slice(0, 7)`: isso é UTC. */
export function mesCorrente(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
