/**
 * As métricas de campanha da ficha (RPC `metricas_do_cliente`, 0174).
 *
 * A RPC é DEFINER de propósito: números iguais para todo papel do salão — a
 * RLS de `appointments` mostraria ao barbeiro só os horários dele, e "sumiu
 * há 40 dias" para quem veio há 3 com outro barbeiro dispara campanha errada.
 * Aqui mora só a APRESENTAÇÃO: rótulos e a régua de em dia/atrasado.
 */

export type MetricasDoCliente = {
  ultima_visita: string | null
  dias_desde_ultima: number | null
  concluidos: number | null
  intervalo_mediano_dias: number | null
  ticket_medio: number | null
  servico_top: string | null
  comprou_produto: boolean | null
  faltas: number | null
  cancelamentos_dele: number | null
  ultima_nota: number | null
  ultima_avaliacao_em: string | null
}

/** "hoje", "ontem", "há N dias" — ou null sem visita concluída. */
export function rotuloDaUltimaVisita(dias: number | null): string | null {
  if (dias == null) return null
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/** "a cada ~N dias" — ou null com menos de 2 visitas (1 visita não tem intervalo). */
export function rotuloDoRitmo(mediana: number | null): string | null {
  if (mediana == null) return null
  return `a cada ~${mediana} dias`
}

/**
 * "Corte · nunca levou produto" — o serviço de sempre com o gancho de venda.
 *
 * O detalhe é oportunidade, não defeito: quem nunca levou produto é o alvo da
 * campanha de pomada; quem leva é candidato a combo. Sem consumo registrado,
 * null — a ficha mostra travessão em vez de inventar hábito.
 */
export function rotuloDoServicoDeSempre(
  servicoTop: string | null,
  comprouProduto: boolean | null,
): { titulo: string; detalhe: string } | null {
  if (!servicoTop) return null
  return {
    titulo: servicoTop,
    detalhe: comprouProduto ? 'e leva produto' : 'nunca levou produto',
  }
}

/**
 * "1 falta · 2 cancelamentos", singular tratado; "Nenhum" quando o histórico
 * existe e está limpo — a proteção de campanha (quem falta muito não recebe
 * oferta de horário nobre) começa por dar nome ao comportamento.
 */
export function rotuloDeFaltas(
  faltas: number | null,
  cancelamentos: number | null,
): string | null {
  if (faltas == null && cancelamentos == null) return null
  const f = faltas ?? 0
  const c = cancelamentos ?? 0
  if (f === 0 && c === 0) return 'Nenhum'
  const partes: string[] = []
  if (f > 0) partes.push(`${f} falta${f === 1 ? '' : 's'}`)
  if (c > 0) partes.push(`${c} cancelamento${c === 1 ? '' : 's'}`)
  return partes.join(' · ')
}

/**
 * "5 de 5 · 12/09" com o tom da conversa: 5 é convite a pedir indicação
 * (verde); 3 para baixo é caso de DONO, não de campanha (âmbar); 4 fica
 * neutro. A data sai por corte de string — fuso do aparelho não muda o dia.
 */
export function rotuloDaNota(
  nota: number | null,
  dataIso: string | null,
): { texto: string; detalhe: string | null; tom: 'boa' | 'neutra' | 'ruim' } | null {
  if (nota == null) return null
  const detalhe = dataIso ? `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}` : null
  const tom = nota >= 5 ? 'boa' : nota <= 3 ? 'ruim' : 'neutra'
  return { texto: `${nota} de 5`, detalhe, tom }
}

export type SituacaoDoCiclo =
  | { tipo: 'em_dia' }
  | { tipo: 'atrasado'; dias: number }

/**
 * Em dia ou atrasado — o gatilho de campanha.
 *
 * Só existe quando há régua (ritmo) E leitura (última visita): sem uma das
 * duas, devolve null e a ficha não inventa situação. Atrasado é passar do
 * ritmo próprio do cliente — quem corta a cada 45 dias não está atrasado no
 * dia 20, quem corta a cada 15 está.
 */
export function situacaoDoCiclo(
  diasDesde: number | null,
  mediana: number | null,
): SituacaoDoCiclo | null {
  if (diasDesde == null || mediana == null) return null
  const alem = diasDesde - mediana
  return alem > 0 ? { tipo: 'atrasado', dias: alem } : { tipo: 'em_dia' }
}
