/**
 * Manhã, tarde e noite — a grade de horários livres, agrupada.
 *
 * POR QUE ISTO SUBSTITUI O "VER MAIS". A grade tem passo de 10 minutos e ganha
 * âncora no fim de cada atendimento (migration 0066): num dia de dois
 * barbeiros passam de oitenta botões. A página resolvia isso cortando em 12 e
 * oferecendo "ver mais 68 horários" — o que escondia a tarde inteira de quem
 * quer voltar depois do trabalho, e obrigava a rolar até o fim para descobrir
 * se havia algo às 18h.
 *
 * Agrupar por período resolve os dois lados: quem quer o mais cedo já tem o
 * "próximo horário livre" em destaque no topo, e quem quer a noite salta
 * direto para lá com a contagem ao lado — sem precisar carregar a lista
 * inteira mentalmente.
 *
 * OS CORTES são os do vocabulário, não os do relógio: meio-dia e 18h. Ninguém
 * chama 17h50 de noite.
 */

/** O mínimo que um horário precisa ter para ser agrupado: 'HH:MM' local. */
type ComHora = { hora_local: string }

export type Periodo<T extends ComHora> = { nome: string; itens: T[] }

const CORTES: { nome: string; ate: number }[] = [
  { nome: 'Manhã', ate: 12 * 60 },
  { nome: 'Tarde', ate: 18 * 60 },
  { nome: 'Noite', ate: Number.POSITIVE_INFINITY },
]

/**
 * 'HH:MM' em minutos. Hora ilegível cai no ÚLTIMO período, nunca fora de todos:
 * sumir com um horário que a edge aceita agendar é pior que mostrá-lo no grupo
 * errado — o botão desaparece da tela e continua valendo no servidor.
 */
function minutos(hhmm: string) {
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60
}

/**
 * Agrupa preservando a ordem que veio (a RPC já devolve `order by inicio`) e
 * **descarta período vazio** — um título "Noite" sobre nada é ruído, e a tela
 * já tem uma frase própria para quando não sobrou horário nenhum.
 */
export function agruparPorPeriodo<T extends ComHora>(horarios: T[]): Periodo<T>[] {
  return CORTES.map(({ nome, ate }, i) => {
    const de = i === 0 ? -1 : CORTES[i - 1].ate
    return { nome, itens: horarios.filter((h) => minutos(h.hora_local) >= de && minutos(h.hora_local) < ate) }
  }).filter((p) => p.itens.length > 0)
}
