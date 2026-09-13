import {
  agoraEmSaoPaulo,
  chaveDe,
  diaDaSemanaDe,
  faixaDoDia,
  type HorarioFuncionamento,
} from './horarioFuncionamento'

/**
 * A faixa de dias da agenda pública (etapa 2, catorze dias).
 *
 * POR QUE CADA DIA PRECISA DE UM ESTADO, e não só de um número. Uma faixa em
 * que todo dia parece disponível é armadilha: a pessoa toca terça, não acha
 * nada, toca quarta, não acha nada, e desiste no terceiro toque — sem nunca ver
 * que sexta estava cheia de vaga. Um dia marcado como cheio é informação; um
 * dia que mente é um beco.
 *
 * FECHADO NÃO É LOTADO, e a diferença importa. `horarios_livres` devolve zero
 * para os dois, então a contagem sozinha não distingue. Aqui se cruzam três
 * coisas: o horário de funcionamento do salão (dia de folga), os dias em que
 * ALGUÉM da equipe tem jornada (`diasDeTrabalho`, que a edge manda), e o
 * relógio (só para hoje). Dia fechado fica desabilitado — tocar num dia que a
 * barbearia não abre e receber "não sobrou horário" faria a pessoa achar que
 * está cheio, e voltar amanhã para tentar de novo.
 *
 * O FUSO é o da barbearia, como em todo o resto: quem abre a página com o
 * celular em outro fuso não pode ver "hoje" no dia errado da faixa.
 */

const CURTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const
const LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const

export type EstadoDoDia =
  /** A barbearia não abre, ou ninguém da equipe trabalha. Botão desabilitado. */
  | 'fechado'
  /** Só hoje: abriu, mas já passou da hora de fechar. */
  | 'encerrado'
  /** Aberto e com gente, mas sem vaga para o serviço escolhido. */
  | 'lotado'
  | 'livre'

export type DiaDaFaixa = {
  /** 'YYYY-MM-DD'. */
  data: string
  livres: number
  estado: EstadoDoDia
  /** 'HOJE', 'AMANHÃ', 'QUI'... */
  rotulo: string
  /** O dia do mês, para o número grande. */
  numero: number
  /** 'hoje', 'amanhã', 'quinta, 18/09' — para títulos e frases. */
  porExtenso: string
  ehHoje: boolean
}

/** O que a edge manda em `dias`. */
export type ContagemDoDia = { dia: string; livres: number }

export function montarFaixa({
  dias,
  horario,
  diasDeTrabalho,
  agora,
}: {
  dias: ContagemDoDia[]
  horario: HorarioFuncionamento
  /** Dias da semana (0 = domingo) em que alguém da equipe tem jornada ativa. */
  diasDeTrabalho: number[]
  agora: Date
}): DiaDaFaixa[] {
  const { data: hoje, hhmm } = agoraEmSaoPaulo(agora)
  const agoraMin = minutos(hhmm)
  const trabalha = new Set(diasDeTrabalho)

  return dias.map((d, i) => {
    const ehHoje = d.dia === hoje
    const faixa = faixaDoDia(horario, chaveDe(d.dia))
    const fechado = !faixa || !trabalha.has(diaDaSemanaDe(d.dia))

    let estado: EstadoDoDia
    if (fechado) estado = 'fechado'
    else if (d.livres > 0) estado = 'livre'
    else if (ehHoje && faixa && agoraMin >= minutos(faixa.fecha)) estado = 'encerrado'
    else estado = 'lotado'

    const semana = diaDaSemanaDe(d.dia)
    const numero = new Date(`${d.dia}T12:00:00Z`).getUTCDate()
    const mes = new Date(`${d.dia}T12:00:00Z`).getUTCMonth() + 1
    const dm = `${String(numero).padStart(2, '0')}/${String(mes).padStart(2, '0')}`

    // "Hoje" e "amanhã" pelo lugar na faixa, não pelo nome do dia: a faixa
    // sempre começa em hoje, e é assim que a pessoa lê ("hoje" é mais rápido de
    // reconhecer que "domingo" quando ela já sabe que dia é).
    return {
      data: d.dia,
      livres: d.livres,
      estado,
      rotulo: i === 0 ? 'HOJE' : i === 1 ? 'AMANHÃ' : CURTO[semana],
      numero,
      porExtenso: i === 0 ? 'hoje' : i === 1 ? 'amanhã' : `${LONGO[semana]}, ${dm}`,
      ehHoje,
    }
  })
}

function minutos(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * O próximo dia com vaga a partir de uma data (exclusive) — o que transforma o
 * beco "não tem nada neste dia" numa porta. Null quando não há nenhum na
 * janela, e aí a frase tem de mandar falar com a barbearia em vez de prometer
 * um dia que não existe.
 */
export function proximoDiaComVaga(faixa: DiaDaFaixa[], depoisDe: string): DiaDaFaixa | null {
  return faixa.find((d) => d.data > depoisDe && d.estado === 'livre') ?? null
}

/** Tem algum dia com vaga na janela inteira? Decide se a frase do vazio promete
 *  outro dia ou manda falar com a barbearia. */
export function temAlgumDiaLivre(faixa: DiaDaFaixa[]) {
  return faixa.some((d) => d.estado === 'livre')
}
