/**
 * O passo do barbeiro na agenda pública (migration 0218).
 *
 * O dono pediu o barbeiro ANTES do horário, por causa de quem tem barbeiro
 * fixo. O risco disso estava escrito no topo da página desde a v1: "escolher o
 * barbeiro primeiro e descobrir que ele está cheio é porta fechada". A resposta
 * a esse risco mora aqui: cada barbeiro vem com o PRÓXIMO horário livre dele, e
 * ninguém escolhe às cegas -- quem quer o Diego já vê que ele só tem amanhã, e
 * decide antes de tocar.
 *
 * Tudo no fuso da barbearia: "hoje" é hoje em São Paulo, não no celular de
 * quem abriu o link num fuso qualquer.
 */

const TZ = 'America/Sao_Paulo'

export type BarbeiroDaAgenda = { id: string; nome: string; proximo: string | null }

/** 'YYYY-MM-DD' do instante, em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  return instante.toLocaleDateString('en-CA', { timeZone: TZ })
}

const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** Nomes curtos à mão, e não `weekday: 'short'`: o Intl devolve "qui." com
 *  ponto em uns ambientes e sem em outros, e o rótulo mudaria de cara conforme
 *  o celular. */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * "hoje às 14:30", "amanhã às 09:00", "qui, 16/10 às 09:00".
 *
 * SEM VAGA É DITO, NÃO ESCONDIDO. O barbeiro sem horário na janela continua na
 * lista com a frase: escondê-lo faria quem tem barbeiro fixo procurar o nome
 * dele e achar que a página quebrou.
 */
export function rotuloDoProximo(
  proximo: string | null | undefined,
  agora: Date,
  diasNaJanela = 14,
): string {
  if (!proximo) return `sem vaga nos próximos ${diasNaJanela} dias`
  const quando = new Date(proximo)
  if (Number.isNaN(quando.getTime())) return `sem vaga nos próximos ${diasNaJanela} dias`

  const hoje = diaEmSaoPaulo(agora)
  const dia = diaEmSaoPaulo(quando)
  const hora = HORA.format(quando)
  if (dia === hoje) return `hoje às ${hora}`
  if (dia === somarDias(hoje, 1)) return `amanhã às ${hora}`

  const [, mes, numero] = dia.split('-')
  const semana = SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]
  return `${semana}, ${numero}/${mes} às ${hora}`
}

/**
 * O horário escolhido COM O DIA: "Amanhã às 10:00", "Sex, 16/10 às 09:00".
 *
 * A confirmação e a tela de sucesso diziam só "10:00" -- herança do tempo em
 * que a agenda pública só marcava para hoje. Com a janela de catorze dias, e
 * desde a 0218 com a grade abrindo sozinha no dia do próximo horário do
 * barbeiro, "10:00" sem o dia deixa a pessoa achar que marcou para hoje. Achado
 * no teste em produção de 08/10, às 20h: a página abriu em amanhã, e a
 * confirmação dizia "10:00 com Rafael Nogueira".
 *
 * A frase é a mesma que a pessoa acabou de ler na lista de barbeiros, com
 * maiúscula porque abre a linha. Instante quebrado cai na hora que o servidor
 * mandou -- nunca em "sem vaga", que seria mentira numa confirmação.
 */
export function rotuloDoHorarioMarcado(
  horario: { inicio: string; hora_local: string },
  agora: Date,
): string {
  if (Number.isNaN(new Date(horario.inicio).getTime())) return horario.hora_local
  const rotulo = rotuloDoProximo(horario.inicio, agora)
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
}

/**
 * O que a seção de horários mostra, entre os quatro estados.
 *
 * ENTRE O TOQUE NUM BARBEIRO E A RESPOSTA, a tela ainda tem a consulta
 * ANTERIOR -- a de antes da escolha: sem barbeiro, de hoje, sem horário
 * nenhum. Desenhá-la como se fosse a resposta dizia "Não sobrou horário hoje
 * para esse serviço. Um serviço mais curto ainda pode caber -- troque acima"
 * por um segundo e meio, e mandava trocar de serviço quem só precisava
 * esperar. Achado no teste em produção de 09/10, gravando os estados da tela:
 * a edge simulada responde na hora, e escondia isto.
 *
 * A REGRA: uma resposta só vale para a escolha que ela diz ter atendido. Se a
 * escolha na tela é outra, a resposta certa ou está chegando ou não veio -- e
 * nenhum dos dois é "lotado". É a mesma régua de `ErroDeCarga`: carregando,
 * vazio e erro não podem se parecer.
 *
 * Trocar de DIA com o mesmo barbeiro não cai aqui: a escolha não muda, e a
 * grade anterior fica esmaecida até a nova chegar, com o dia dela no título.
 */
export type EstadoDaGrade = 'carregando' | 'falhou' | 'vazia' | 'cheia'

export function estadoDaGrade({
  escolhaPedida,
  escolhaRespondida,
  atualizando,
  horarios,
}: {
  /** O barbeiro marcado na tela ('qualquer', o id, ou nulo). */
  escolhaPedida: string | null
  /** A escolha que a resposta na tela diz ter atendido. */
  escolhaRespondida: string | null | undefined
  atualizando: boolean
  horarios: number
}): EstadoDaGrade {
  if ((escolhaRespondida ?? null) !== escolhaPedida) return atualizando ? 'carregando' : 'falhou'
  return horarios === 0 ? 'vazia' : 'cheia'
}

/**
 * O dia em que a grade deve ABRIR depois que a pessoa escolhe.
 *
 * Abrir sempre em "hoje" recriaria a porta fechada por outro caminho: quem
 * escolhe o Diego, que só tem amanhã, cairia num dia vazio e acharia que ele
 * não tem horário nenhum. Abrindo no dia do próximo horário dele, o primeiro
 * horário livre já está na tela.
 *
 * Para "qualquer um", vale o mais cedo entre todos.
 */
export function diaParaAbrir(
  escolha: string,
  barbeiros: BarbeiroDaAgenda[],
): string | null {
  const proximos =
    escolha === 'qualquer'
      ? barbeiros.map((b) => b.proximo).filter((p): p is string => !!p)
      : barbeiros.filter((b) => b.id === escolha && b.proximo).map((b) => b.proximo as string)
  if (!proximos.length) return null
  const maisCedo = proximos.reduce((a, b) => (new Date(a) <= new Date(b) ? a : b))
  return diaEmSaoPaulo(new Date(maisCedo))
}

/** O primeiro horário livre entre todos -- o que o "qualquer um" oferece. */
export function proximoDeQualquerUm(barbeiros: BarbeiroDaAgenda[]): string | null {
  const proximos = barbeiros.map((b) => b.proximo).filter((p): p is string => !!p)
  if (!proximos.length) return null
  return proximos.reduce((a, b) => (new Date(a) <= new Date(b) ? a : b))
}
