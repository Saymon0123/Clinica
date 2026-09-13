/**
 * O horário de funcionamento da barbearia, lido pela tela pública.
 *
 * POR QUE ISTO EXISTE. A etapa 1 da agenda pelo QR troca o ícone do Club Cut
 * pela identidade da barbearia: nome, "aberto agora", endereço e WhatsApp. O
 * dado já estava no banco (`salons.horario_funcionamento`) e ninguém o
 * mostrava — quem escaneia o QR às 21h não tinha como saber se o expediente já
 * tinha acabado ou se a agenda estava só cheia.
 *
 * O FUSO É FIXO, e isso não é detalhe. Quem abre a página pode estar com o
 * celular em outro fuso (viajante, relógio configurado errado, navegador em
 * UTC). Todo o resto do sistema raciocina em `America/Sao_Paulo` — a RPC
 * `horarios_livres` fixa o fuso, a edge fixa o fuso — e aqui é igual. Ler o
 * fuso do aparelho faria a pílula dizer "fechado" numa barbearia aberta.
 *
 * O FORMATO É O MESMO QUE O BANCO ACEITA. `horarios_livres` filtra
 * `^[0-9]{1,2}:[0-9]{2}$` antes do `::time`, e `_shared/semHorario.ts` repete a
 * mesma régua. Dia mal preenchido é tratado como fechado nos três lugares — e
 * é de propósito: um `abre: "9h"` gravado à mão não pode derrubar a página.
 *
 * O QUE ELE NÃO FAZ: decidir se há horário livre. Isso é da RPC. Aqui só se
 * responde "a porta está aberta agora?", que é outra pergunta — barbearia
 * aberta e lotada é o caso mais comum de todos.
 */

const TZ = 'America/Sao_Paulo'

/** As chaves de `salons.horario_funcionamento`, na ordem do `getDay()`. */
const CHAVES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
export type ChaveDoDia = (typeof CHAVES)[number]

/** Segunda primeiro: é como a pessoa lê a semana, não como o `getDay()` conta. */
export const SEMANA: readonly ChaveDoDia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']

const NOMES: Record<ChaveDoDia, string> = {
  dom: 'Domingo',
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
}

/** O mesmo filtro de formato que `horarios_livres` aplica antes do `::time`. */
const HORA = /^[0-9]{1,2}:[0-9]{2}$/

export type FaixaDoDia = { abre: string; fecha: string }
export type HorarioFuncionamento = Record<string, unknown> | null | undefined

function minutos(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 'HH:MM' com o zero à esquerda: `9:00` gravado à mão vira `09:00` na tela. */
function normalizar(hhmm: string) {
  const [h, m] = hhmm.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

/**
 * A faixa daquele dia, ou null quando fechado — e "fechado" inclui o dia mal
 * preenchido. Faixa invertida (fecha antes de abrir) também é recusada: é
 * dado impossível, e aceitá-la faria a pílula dizer "aberto" 24h por dia.
 */
export function faixaDoDia(
  horario: HorarioFuncionamento,
  chave: ChaveDoDia,
): FaixaDoDia | null {
  const bruto = horario?.[chave] as { abre?: unknown; fecha?: unknown } | null | undefined
  const abre = typeof bruto?.abre === 'string' ? bruto.abre : null
  const fecha = typeof bruto?.fecha === 'string' ? bruto.fecha : null
  if (!abre || !fecha || !HORA.test(abre) || !HORA.test(fecha)) return null
  if (minutos(abre) >= minutos(fecha)) return null
  return { abre: normalizar(abre), fecha: normalizar(fecha) }
}

/**
 * Agora em São Paulo: o dia da semana e a hora, sem depender do fuso do
 * aparelho. O meio-dia UTC na conversão de volta é a mesma defesa que
 * `chaveDoDia` usa na edge — longe da virada, o dia não escorrega.
 */
export function agoraEmSaoPaulo(agora: Date): { data: string; dia: number; hhmm: string } {
  const data = agora.toLocaleDateString('en-CA', { timeZone: TZ })
  const hhmm = agora.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return { data, dia: new Date(`${data}T12:00:00Z`).getUTCDay(), hhmm }
}

/** O dia da semana de um 'YYYY-MM-DD', na contagem do `getDay()` (0 = domingo).
 *  Meio-dia UTC pelo mesmo motivo de sempre: longe da virada. */
export function diaDaSemanaDe(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

/** A chave de `horario_funcionamento` para um 'YYYY-MM-DD'. */
export function chaveDe(iso: string): ChaveDoDia {
  return CHAVES[diaDaSemanaDe(iso)]
}

export type Situacao =
  | { aberta: true; fecha: string }
  | { aberta: false; quando: string; hora: string }

/**
 * "Aberto agora · fecha às 19:00" ou "Fechado · abre amanhã às 09:00".
 *
 * Devolve **null** quando não dá para afirmar nada — nenhum dia da semana com
 * faixa válida. A tela então não mostra pílula nenhuma, que é melhor que
 * mostrar "Fechado" para uma barbearia que só esqueceu de preencher o cadastro:
 * a pessoa está de pé no balcão vendo o barbeiro cortar.
 */
export function situacaoAgora(horario: HorarioFuncionamento, agora: Date): Situacao | null {
  const { dia, hhmm } = agoraEmSaoPaulo(agora)
  const agoraMin = minutos(hhmm)
  const hoje = faixaDoDia(horario, CHAVES[dia])

  if (hoje && agoraMin >= minutos(hoje.abre) && agoraMin < minutos(hoje.fecha)) {
    return { aberta: true, fecha: hoje.fecha }
  }
  if (hoje && agoraMin < minutos(hoje.abre)) {
    return { aberta: false, quando: 'hoje', hora: hoje.abre }
  }

  // Daqui a 1 a 7 dias. O 7 fecha a volta e cai no MESMO dia da semana — é o
  // que responde a barbearia que abre um dia só, em vez de devolver null e
  // sumir com a informação.
  for (let i = 1; i <= 7; i++) {
    const chave = CHAVES[(dia + i) % 7]
    const faixa = faixaDoDia(horario, chave)
    if (!faixa) continue
    return { aberta: false, quando: i === 1 ? 'amanhã' : NOMES[chave].toLowerCase(), hora: faixa.abre }
  }
  return null
}

export type DiaDaSemana = { chave: ChaveDoDia; nome: string; faixa: FaixaDoDia | null; hoje: boolean }

/**
 * Os sete dias para o quadro de funcionamento, segunda a domingo, com o de
 * hoje marcado. **null** quando nenhum dia tem faixa válida: um quadro com
 * sete "Fechado" não informa nada e ainda passa a impressão de barbearia
 * fechada para sempre.
 */
export function semanaDe(horario: HorarioFuncionamento, agora: Date): DiaDaSemana[] | null {
  const { dia } = agoraEmSaoPaulo(agora)
  const hojeChave = CHAVES[dia]
  const dias = SEMANA.map((chave) => ({
    chave,
    nome: NOMES[chave],
    faixa: faixaDoDia(horario, chave),
    hoje: chave === hojeChave,
  }))
  return dias.some((d) => d.faixa) ? dias : null
}
