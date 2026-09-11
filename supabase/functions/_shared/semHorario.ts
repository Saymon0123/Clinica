/**
 * Por que a agenda pública ficou sem horário (M8 do giro de 10/09).
 *
 * A lista vazia tinha quatro causas e uma frase só — "tente outro serviço
 * acima" —, que mentia em três delas: barbearia sem serviço (o seletor nem
 * tinha opção), dia de folga e link aberto depois do expediente. Só no dia
 * cheio trocar de serviço podia ajudar.
 *
 * Código puro, sem nada do Deno, para o vitest testar daqui (ver
 * `vitest.config.ts`). A edge `agenda-publica` calcula; a tela só traduz.
 */
export type MotivoSemHorario = 'sem_servicos' | 'fechado_hoje' | 'expediente_acabou' | 'lotado'

type Faixa = { abre?: unknown; fecha?: unknown } | null | undefined

/** As chaves de `salons.horario_funcionamento`, na ordem do `getUTCDay()`. */
const CHAVES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

/** O mesmo filtro de formato que `horarios_livres` aplica antes do `::time`. */
const HORA = /^[0-9]{1,2}:[0-9]{2}$/

function minutos(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Chave do dia para 'YYYY-MM-DD' (a data de hoje em São Paulo). Meio-dia UTC
 * de propósito: longe da virada, o dia da semana não depende do fuso de quem
 * roda.
 */
export function chaveDoDia(dataISO: string): (typeof CHAVES)[number] {
  return CHAVES[new Date(`${dataISO}T12:00:00Z`).getUTCDay()]
}

/**
 * Chamada só quando `horarios_livres` voltou vazio e há serviço. Dia fechado
 * no horário da barbearia, dia mal preenchido (que `horarios_livres` também
 * trata como fechado) e dia sem ninguém de jornada viram "fechado hoje"; hora
 * igual ou depois do fechamento, "expediente acabou"; o resto é agenda cheia
 * para esse serviço.
 */
export function motivoSemHorario({
  horario,
  dia,
  agora,
  alguemTrabalhaHoje,
}: {
  horario: Record<string, Faixa> | null | undefined
  dia: string
  /** 'HH:MM' em São Paulo. */
  agora: string
  alguemTrabalhaHoje: boolean
}): Exclude<MotivoSemHorario, 'sem_servicos'> {
  const faixa = horario?.[dia]
  const abre = typeof faixa?.abre === 'string' ? faixa.abre : null
  const fecha = typeof faixa?.fecha === 'string' ? faixa.fecha : null
  if (!abre || !fecha || !HORA.test(abre) || !HORA.test(fecha) || !alguemTrabalhaHoje) {
    return 'fechado_hoje'
  }
  if (minutos(agora) >= minutos(fecha)) return 'expediente_acabou'
  return 'lotado'
}
