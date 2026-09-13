import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { MarcaClubCut } from '../../components/MarcaClubCut'
import { useParams } from 'react-router-dom'
import { ArrowRight, Check, Clock, MapPin, MessageCircle } from 'lucide-react'
import { invokeFunction } from '../../lib/invokeFunction'
import { ErroInline } from '../../components/ErroInline'
import { AVISO_TELEFONE_FORMATO, classificarTelefone } from '../../lib/telefone'
import { mensagemSemHorario, type MotivoSemHorario } from './semHorario'
import {
  semanaDe,
  situacaoAgora,
  type HorarioFuncionamento,
  type Situacao,
} from './horarioFuncionamento'
import { agruparPorPeriodo } from './periodos'
import {
  montarFaixa,
  proximoDiaComVaga,
  temAlgumDiaLivre,
  type ContagemDoDia,
  type DiaDaFaixa,
} from './dias'

/**
 * A página que o QR do balcão abre.
 *
 * Aberta **sem login**, por quem está de pé na barbearia com o celular na mão.
 * Tudo aqui é desenhado para esse contexto: telefone, pressa, e uma pessoa que
 * nunca viu o sistema.
 *
 * A ordem — serviço, depois horário, depois quem é você — não é arbitrária. O
 * horário livre **depende da duração do serviço**, então perguntar o serviço
 * antes é o que evita oferecer 14:45 para um corte que leva uma hora. E o nome
 * fica por último porque é o único passo chato: pedir antes faria a pessoa
 * decidir se vale a pena sem nem saber se tem horário.
 *
 * Mostra por **horário**, com o barbeiro em cada um, e não o contrário. Escolher
 * o barbeiro primeiro e descobrir que ele está cheio é porta fechada; ver que
 * tem 14:30 com o Rafael é porta aberta.
 *
 * ─── Etapa 1 da versão 2 (13/09/2026) ───────────────────────────────────────
 *
 * O dono olhou a página e disse: "muito vazia, pouco profissional". Estava
 * certo, e a causa era concreta — o topo trazia o ícone do **Club Cut**, não o
 * da barbearia. Quem escaneia o QR não veio procurar o Club Cut; veio marcar
 * horário na barbearia em que está de pé. O dado para fazer diferente já estava
 * no banco desde sempre (`endereco`, `horario_funcionamento`) e ninguém o
 * mostrava.
 *
 * O que mudou, e por quê:
 *
 * - **Herói da barbearia** no lugar da marca do produto: iniciais, nome,
 *   "aberto agora", endereço e WhatsApp. Sem endereço cadastrado a linha some,
 *   em vez de deixar um espaço vazio que parece defeito.
 * - **Serviços em cartões** com preço e duração, no lugar de um `<select>` que
 *   escondia as duas informações que decidem a escolha atrás de um toque.
 * - **Próximo horário livre em destaque** e o resto por período. Isto SUBSTITUI
 *   o "ver mais N horários": o corte em 12 existia porque o mais cedo ficava
 *   enterrado, e um botão dedicado ao mais cedo resolve isso melhor do que
 *   esconder a tarde inteira.
 * - **Esqueleto** no carregamento, no lugar de "Carregando horários...".
 * - **Duas colunas no computador**, com a identidade fixa na lateral.
 *
 * O Club Cut sai do topo e vai para o rodapé. A marca continua lá — em tamanho
 * de assinatura, que é o lugar dela numa página que é da barbearia.
 *
 * O que NÃO entrou aqui, de propósito (etapas 2 a 6 do plano em
 * `docs/backlog.md`): os 14 dias, o horário guardado no celular, remarcar pelo
 * link, o "já tenho horário" e o aviso à barbearia quando o cliente cancela.
 */

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Horario = { professional_id: string; profissional: string; inicio: string; hora_local: string }
type Consulta = {
  salao: string
  /** Ja pronto para o wa.me: DDI + DDD + numero, so digitos. Pode faltar. */
  whatsappBarbearia?: string | null
  /** Ausente na maioria das barbearias: o campo e opcional no cadastro. */
  endereco?: string | null
  /** `{seg: {abre, fecha}, ...}`, com null no dia de folga. Pode nao vir. */
  horarioFuncionamento?: HorarioFuncionamento
  servicos: Servico[]
  servicoEscolhido?: string
  /** Os serviços que o servidor de fato aceitou, na ordem escolhida. Ausente
   *  numa edge anterior à seleção múltipla. */
  servicosEscolhidos?: string[]
  /** Soma das durações — usada para dizer quanto tempo o atendimento leva. */
  duracaoTotal?: number
  /** O dia que esta resposta descreve, 'YYYY-MM-DD'. Quem manda é o servidor:
   *  ele valida a janela e devolve o dia que de fato consultou. */
  data?: string
  /** Quantos horários sobraram em cada um dos dias da janela (etapa 2). */
  dias?: ContagemDoDia[]
  /** Dias da semana (0 = domingo) em que alguém da equipe tem jornada. Separa
   *  "fechado" de "lotado" na faixa. */
  diasDeTrabalho?: number[]
  horarios: Horario[]
  /** Por que `horarios` veio vazio (M8). Ausente numa função anterior a isto. */
  motivoVazio?: MotivoSemHorario | null
}

/** Palavras que não viram inicial: "Barbearia do João" é BJ, não BDJ. */
const LIGACOES = /^(de|da|do|das|dos|e|em|no|na|the|of)$/i

function iniciaisDe(nome: string) {
  const partes = nome.trim().split(/\s+/).filter((p) => p && !LIGACOES.test(p))
  if (!partes.length) return '?'
  const letras =
    partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]
  return letras.toUpperCase()
}

/**
 * A saida que TODO beco desta pagina oferece.
 *
 * Achado de 04/09/2026: os tres finais de linha -- sem horario hoje, recurso
 * desligado, barbearia sem cadastro -- diziam "fale com a barbearia" sem dizer
 * como. O numero ja estava no banco e o `/meu-horario` ja o usava; faltava
 * aqui, justamente onde a pessoa nao tem mais o que fazer sozinha.
 *
 * Três formas: `bloco` é a saída de um beco, e ocupa a largura toda porque é a
 * única coisa que sobrou para fazer; `chip` é o contato no herói, ao lado do
 * endereço, onde ele é uma opção entre outras e não pode competir com o botão
 * de marcar horário; `porta` é o "já tenho horário" no topo da tela de marcar.
 *
 * TODAS montam o link no MESMO lugar, de propósito. O número já vem pronto da
 * edge (`numeroParaWhatsApp`), e o `wa.me` já foi construído em cinco lugares
 * diferentes neste projeto, cada um com uma regra — foi assim que o telefone da
 * El Guardians passou meses apontando para um número que não existe.
 */
function FalarComABarbearia({
  numero,
  forma = 'bloco',
  mensagem,
}: {
  numero?: string | null
  forma?: 'bloco' | 'chip' | 'porta'
  /** Texto já digitado na conversa. O WhatsApp deixa a pessoa apagar antes de
   *  enviar, então não é promessa — é economia de digitação, e do outro lado a
   *  barbearia já sabe do que se trata antes de abrir. */
  mensagem?: string
}) {
  if (!numero) return null
  const href = `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`

  if (forma === 'chip') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-primary"
      >
        <MessageCircle size={14} />
        WhatsApp
      </a>
    )
  }

  if (forma === 'porta') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-3.5 py-3 transition-colors duration-150 hover:border-primary"
      >
        <span className="min-w-0">
          <strong className="block text-sm font-semibold text-foreground">
            Já tem horário marcado?
          </strong>
          {/* O protótipo dizia "receba o link dele no seu WhatsApp". Era verdade
              no desenho que dependia de um modelo aprovado pela Meta; a decisão
              do dono (13/09) foi não depender disso e mandar a pessoa direto
              para a barbearia. A frase teve de mudar junto — prometer um link
              que não chega é o tipo de mentira que faz a pessoa esperar. */}
          <span className="block text-[13px] leading-snug text-muted-foreground">
            Chame a barbearia no WhatsApp para remarcar ou cancelar.
          </span>
        </span>
        <MessageCircle size={18} className="shrink-0 text-primary" aria-hidden />
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex w-full items-center justify-center gap-2 btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
    >
      <MessageCircle size={16} />
      Falar com a barbearia
    </a>
  )
}

/** A pílula do "aberto agora". Some quando não há horário utilizável no
 *  cadastro — dizer "Fechado" para quem está vendo o barbeiro cortar seria
 *  mentira, e uma mentira que faz a pessoa ir embora. */
function PilulaDeSituacao({ situacao }: { situacao: Situacao | null }) {
  if (!situacao) return null
  const aberta = situacao.aberta
  return (
    <span
      className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        aberta
          ? 'border-success/40 bg-success-soft text-success'
          : 'border-border bg-surface-2 text-muted-foreground'
      }`}
    >
      <span
        aria-hidden
        className={`block h-2 w-2 rounded-full ${aberta ? 'bg-success' : 'bg-muted-foreground'}`}
      />
      {aberta
        ? `Aberto agora · fecha às ${situacao.fecha}`
        : `Fechado agora · abre ${situacao.quando} às ${situacao.hora}`}
    </span>
  )
}

function Heroi({
  nome,
  endereco,
  situacao,
  whatsapp,
  desistiu,
}: {
  /** Nulo enquanto a resposta não chegou, e também quando ela falhou antes de
   *  dizer de quem é a barbearia. */
  nome: string | null
  endereco?: string | null
  situacao: Situacao | null
  whatsapp?: string | null
  /** Já falhou: não há mais nome para esperar, e o esqueleto viraria uma
   *  espera que nunca termina. */
  desistiu?: boolean
}) {
  return (
    <div className="border-b border-border bg-surface px-4 pb-4 pt-6 lg:border-b-0 lg:bg-transparent lg:px-6 lg:pt-8">
      {!nome && desistiu ? (
        <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground">
          Agendar horário
        </h1>
      ) : nome ? (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold tracking-tight text-primary-foreground"
          >
            {iniciaisDe(nome)}
          </span>
          <h1 className="min-w-0 text-balance text-xl font-bold leading-tight tracking-tight text-foreground">
            {nome}
          </h1>
        </div>
      ) : (
        // Sem o nome não há iniciais. Passar a frase de espera para
        // `iniciaisDe` rendia um selo verde escrito "CA", de "Carregando..." —
        // uma marca inventada no lugar exato onde a pessoa procura confirmação
        // de que abriu o link certo. O esqueleto não afirma nada.
        <div className="flex items-center gap-3" aria-hidden>
          <div className="esqueleto h-14 w-14 shrink-0 rounded-2xl" />
          <div className="grid w-full gap-2">
            <div className="esqueleto h-5 w-2/3" />
            <div className="esqueleto h-3.5 w-1/2" />
          </div>
        </div>
      )}

      {/* A pílula fica FORA da linha do avatar de propósito. Encaixada ao lado
          do nome ela dispunha de uns 220px na lateral do computador e quebrava
          "Fechado agora · abre amanhã às 09:00" em duas linhas, com a bolinha
          órfã na primeira. Aqui ela tem a largura toda. */}
      <PilulaDeSituacao situacao={situacao} />

      {/* Sem endereço cadastrado a linha inteira some. O campo é opcional no
          CRM e a maioria das barbearias não preenche; deixar o ícone com um
          espaço em branco ao lado parece campo que não carregou. */}
      {endereco && (
        <p className="mt-3.5 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
          <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {endereco}{' '}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline"
            >
              ver no mapa
            </a>
          </span>
        </p>
      )}

      {whatsapp && (
        <div className="mt-3.5">
          <FalarComABarbearia numero={whatsapp} forma="chip" />
        </div>
      )}
    </div>
  )
}

/** O quadro de funcionamento. Some por inteiro quando nenhum dia tem faixa
 *  válida — sete linhas de "Fechado" não informam nada e ainda passam a
 *  impressão de barbearia fechada para sempre. */
function SemanaDeFuncionamento({
  horario,
  agora,
  className = '',
}: {
  horario: HorarioFuncionamento
  agora: Date
  className?: string
}) {
  const semana = semanaDe(horario, agora)
  if (!semana) return null
  return (
    <section className={className}>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Horário de funcionamento
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        {semana.map((d) => (
          <div key={d.chave} className="contents">
            <dt className={d.hoje ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              {d.nome}
              {d.hoje ? ' (hoje)' : ''}
            </dt>
            <dd
              className={`text-right tabular-nums ${
                d.hoje ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {d.faixa ? `${d.faixa.abre} – ${d.faixa.fecha}` : 'Fechado'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * A faixa dos catorze dias (etapa 2).
 *
 * ROLA NA HORIZONTAL com encaixe, porque catorze botões não cabem na largura de
 * um celular e empilhá-los comeria a tela inteira antes do primeiro horário.
 *
 * DIA FECHADO FICA DESABILITADO, não escondido. Escondê-lo faria a faixa pular
 * de sábado para segunda sem explicação, e a pessoa procuraria o domingo
 * achando que a página bugou. Desabilitado com a palavra "fechado" embaixo ela
 * lê a folga da barbearia de relance — que é informação que ela queria.
 *
 * A CONTAGEM embaixo de cada dia é o que impede a faixa de virar armadilha: sem
 * ela, todo dia parece disponível, e a pessoa toca três em sequência antes de
 * desistir.
 */
function FaixaDeDias({
  faixa,
  atual,
  aoEscolher,
}: {
  faixa: DiaDaFaixa[]
  atual?: string
  aoEscolher: (data: string) => void
}) {
  return (
    <div
      role="group"
      aria-label="Escolha o dia"
      // A faixa rola DENTRO de si mesma. A primeira versão sangrava até a borda
      // com `-mx-4 px-4`, que é bonito e estava errado: o elemento ficava mais
      // largo que o contêiner e quem passava a rolar na horizontal era a PÁGINA
      // — cartão de serviço cortado à direita, botão "Ver amanhã" pela metade.
      className="mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2"
    >
      {faixa.map((d) => {
        const fechado = d.estado === 'fechado'
        return (
          <button
            key={d.data}
            type="button"
            disabled={fechado}
            aria-pressed={d.data === atual}
            aria-label={`${d.porExtenso}: ${rotuloDoEstado(d)}`}
            onClick={() => aoEscolher(d.data)}
            className="group grid w-[72px] shrink-0 snap-start justify-items-center gap-0.5 rounded-xl border-[1.5px] border-border bg-surface px-1 py-2 text-foreground transition-[border-color,background-color] duration-150 hover:border-primary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {/* `group-aria-pressed` e não `aria-pressed`: a variante olha o
                elemento em que está escrita, e o `aria-pressed` mora no botão.
                Sem o grupo, o rótulo e a contagem ficariam cinza sobre o verde
                do dia selecionado — ilegíveis. */}
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground group-aria-pressed:text-inherit">
              {d.rotulo}
            </span>
            <span
              className={`text-[19px] font-extrabold leading-tight tabular-nums text-inherit ${
                fechado ? 'line-through' : ''
              }`}
            >
              {d.numero}
            </span>
            <span className="text-[10px] text-muted-foreground group-aria-pressed:text-inherit">
              {rotuloDoEstado(d)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function rotuloDoEstado(d: DiaDaFaixa) {
  if (d.estado === 'fechado') return 'fechado'
  if (d.estado === 'encerrado') return 'encerrado'
  if (d.estado === 'lotado') return 'lotado'
  return `${d.livres} ${d.livres === 1 ? 'livre' : 'livres'}`
}

/**
 * O esqueleto tem a FORMA do que vem: título, cartões de serviço, o destaque do
 * próximo horário e a grade. É isso que o diferencia de um "carregando" — ele
 * já diz que tipo de página é, antes de a página existir.
 *
 * `aria-hidden` no bloco inteiro: leitor de tela não tem o que anunciar sobre
 * retângulos cinzas, e o `aria-busy` da região é que carrega a informação.
 */
function Esqueleto() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="space-y-3">
        <div className="esqueleto h-4 w-40" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`esqueleto h-[72px] w-full ${i > 1 ? 'hidden sm:block' : ''}`} />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="esqueleto h-4 w-32" />
        <div className="esqueleto h-[68px] w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="esqueleto h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgendaPublicaPage() {
  const { salonId } = useParams<{ salonId: string }>()

  const [dados, setDados] = useState<Consulta | null>(null)
  // LISTA, nao um id. Corte + barba num agendamento so ja existia no balcao
  // desde a migration 0120; o QR era a "fase 2" que ela deixou escrita.
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [escolhido, setEscolhido] = useState<Horario | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  const [carregando, setCarregando] = useState(true)
  // Trocar de serviço recarrega a lista. Antes isso caía em `carregando` e
  // apagava a tela inteira — inclusive os cartões de serviço, que não mudam —
  // e o esqueleto tornaria o pisca-pisca pior, não melhor. Aqui a lista velha
  // fica na tela, esmaecida, e só a grade de horários espera.
  const [atualizando, setAtualizando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  // O link de gestão: é a única chave para cancelar este horário depois.
  const [tokenGestao, setTokenGestao] = useState<string | null>(null)
  // Guardado FORA de `dados` porque o caso que mais precisa dele é justamente
  // aquele em que `dados` fica nulo: recurso desligado, teto batido, falha de
  // carga. Vem no corpo da resposta mesmo quando ela é de erro.
  const [whatsapp, setWhatsapp] = useState<string | null>(null)
  // Idem para o nome: no 403 de recurso desligado a barbearia existe, e dizer
  // o nome dela confirma que a pessoa abriu o link certo.
  const [nomeSalao, setNomeSalao] = useState<string | null>(null)

  // Fixado na montagem de propósito. A pílula "aberto agora" e o quadro da
  // semana são lidos nos primeiros segundos; recalcular a cada render faria a
  // frase mudar no meio do preenchimento sem nada ter acontecido, e prender o
  // relógio num estado só para ver a hora virar é peso sem retorno numa tela
  // que a pessoa usa por dois minutos.
  const [agora] = useState(() => new Date())

  const consultar = useCallback(
    async (
      servicos?: string[],
      opcoes?: { manterErro?: boolean; recarga?: boolean; data?: string },
    ) => {
      if (opcoes?.recarga) setAtualizando(true)
      else setCarregando(true)
      // A recarga depois de um "não" NÃO apaga o motivo (achado 25 da revisão
      // de 01/09). Antes apagava: a mensagem era gravada e, uma linha depois,
      // esta consulta a zerava — o cliente via a lista piscar e nada explicava
      // por que não deu. Quem está sozinho no balcão com o celular na mão não
      // tenta descobrir; desiste.
      if (!opcoes?.manterErro) setErro(null)
      const { data, error, corpo } = await invokeFunction<Consulta>('agenda-publica', {
        body: {
          salonId,
          acao: 'consultar',
          servicoIds: servicos,
          // O singular vai junto para a edge ANTERIOR a esta continuar
          // entendendo o pedido durante os minutos entre ela subir e a Vercel
          // terminar o build. Sem ele, aquela edge nao veria servico nenhum e
          // cairia no mais barato do catalogo -- marcaria o servico errado.
          servicoId: servicos?.[0],
          data: opcoes?.data,
        },
      })
      setCarregando(false)
      setAtualizando(false)
      const doCorpo = corpo as Consulta | undefined
      if (doCorpo?.whatsappBarbearia) setWhatsapp(doCorpo.whatsappBarbearia)
      if (doCorpo?.salao) setNomeSalao(doCorpo.salao)
      if (error || !data) {
        setErro(error ?? 'Não foi possível carregar os horários.')
        return
      }
      setWhatsapp(data.whatsappBarbearia ?? null)
      setNomeSalao(data.salao)
      setDados(data)
      // Quem manda é o servidor: ele resolveu os ids contra o catálogo real e
      // descartou o que não era dele. `servicoEscolhido` (singular) é o retorno
      // de uma edge anterior a isto, e vale como lista de um.
      setServicoIds(
        data.servicosEscolhidos ?? (data.servicoEscolhido ? [data.servicoEscolhido] : []),
      )
      // O horário escolhido só sobrevive se ainda estiver na lista nova. Se
      // alguém o pegou no meio, ele some da tela sem a pessoa precisar clicar —
      // e a mensagem de cima diz o porquê.
      setEscolhido((atual) =>
        atual &&
        data.horarios.some(
          (h) => h.inicio === atual.inicio && h.professional_id === atual.professional_id,
        )
          ? atual
          : null,
      )
    },
    [salonId],
  )

  useEffect(() => {
    consultar()
  }, [consultar])

  async function agendar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!nome.trim()) return setErro('Informe seu nome.')
    // A mesma régua do banco (CHECK de 10 a 13 dígitos, migration 0128). Só o
    // piso deixava passar 14 dígitos: o insert quebrava lá atrás e voltava um
    // 500 genérico, que aqui ainda derruba a escolha do horário e joga a pessoa
    // de volta na lista — ela perde o que já tinha feito sem saber o motivo.
    // Aqui, diferente do CRM, o campo é obrigatório: vazio tem aviso próprio,
    // porque "deixe em branco" não é opção para quem precisa ser avisado do
    // horário.
    const estadoDoTelefone = classificarTelefone(telefone)
    if (estadoDoTelefone === 'vazio') return setErro('Informe seu WhatsApp com DDD.')
    if (estadoDoTelefone === 'invalido') return setErro(AVISO_TELEFONE_FORMATO)
    if (!escolhido || !servicoIds.length) return setErro('Escolha um horário.')

    setEnviando(true)
    const { data, error, corpo } = await invokeFunction<{ ok: boolean; conflito?: boolean; tokenGestao?: string }>(
      'agenda-publica',
      {
        body: {
          salonId,
          acao: 'agendar',
          nome: nome.trim(),
          telefone: telefone.trim(),
          servicoIds,
          servicoId: servicoIds[0],
          profissionalId: escolhido.professional_id,
          inicio: escolhido.inicio,
        },
      },
    )
    setEnviando(false)

    if (error || !data?.ok) {
      const numeroDoCorpo = (corpo as Consulta | undefined)?.whatsappBarbearia ?? null
      if (numeroDoCorpo) setWhatsapp(numeroDoCorpo)
      setErro(error ?? 'Não foi possível agendar.')
      // A lista se atualiza (horário tomado no meio do preenchimento some
      // dela), mas o motivo fica na tela e o que a pessoa já preencheu também.
      // Se o horário dela ainda estiver livre — erro de telefone, por exemplo
      // — ele continua escolhido: ela corrige o campo e tenta de novo, sem
      // recomeçar do zero.
      // Recarrega NO MESMO DIA que estava na tela. Sem passar a data, a lista
      // voltaria para hoje e a pessoa que tinha escolhido sexta perderia o dia
      // junto com o horário — por causa de um erro de telefone.
      consultar(servicoIds, { manterErro: true, recarga: true, data: dados?.data })
      return
    }
    setTokenGestao(data.tokenGestao ?? null)
    setPronto(true)
  }

  // Na ORDEM em que a pessoa escolheu, não na do catálogo: é ela que vira
  // `appointment_services.ordem` e decide qual é o serviço principal.
  const servicosEscolhidos = servicoIds
    .map((id) => dados?.servicos.find((s) => s.id === id))
    .filter((s): s is Servico => !!s)
  const precoTotal = servicosEscolhidos.reduce((t, s) => t + s.preco, 0)
  const duracaoTotal = servicosEscolhidos.reduce((t, s) => t + s.duracao_minutos, 0)
  const resumoDosServicos = servicosEscolhidos.map((s) => s.nome).join(' + ')
  const situacao = situacaoAgora(dados?.horarioFuncionamento, agora)
  // O nome do barbeiro em cada botão só quando há mais de um na lista. Com um
  // barbeiro só — que é a barbearia mais comum — o nome é a mesma palavra
  // repetida quarenta vezes, e ruído repetido some da vista junto com o resto.
  const variosBarbeiros = new Set(dados?.horarios.map((h) => h.professional_id)).size > 1
  const proximo = dados?.horarios[0] ?? null
  const ehOEscolhido = (h: Horario) =>
    !!escolhido && escolhido.inicio === h.inicio && escolhido.professional_id === h.professional_id

  // A faixa dos catorze dias. Vazia quando a resposta é de uma edge anterior à
  // etapa 2 — e aí a tela volta a se comportar como antes, com o dia de hoje e
  // sem faixa, em vez de quebrar. Isso acontece de verdade na janela entre a
  // edge subir e a Vercel terminar o build.
  const faixa: DiaDaFaixa[] = dados?.dias?.length
    ? montarFaixa({
        dias: dados.dias,
        horario: dados.horarioFuncionamento,
        diasDeTrabalho: dados.diasDeTrabalho ?? [],
        agora,
      })
    : []
  const diaAberto = faixa.find((d) => d.data === dados?.data) ?? null
  const proximoComVaga = dados?.data ? proximoDiaComVaga(faixa, dados.data) : null

  function escolher(h: Horario) {
    setEscolhido(h)
    setErro(null)
  }

  function abrirDia(data: string) {
    if (data === dados?.data) return
    setEscolhido(null)
    consultar(servicoIds, { recarga: true, data })
  }

  /**
   * Marca ou desmarca um serviço.
   *
   * O HORÁRIO ESCOLHIDO CAI JUNTO, sempre. Trocar a lista muda a duração, e um
   * horário que cabia para o corte de 40 min pode não caber para corte+barba de
   * 70 — manter a escolha na tela levaria a pessoa ao passo 3 com um horário que
   * o servidor vai recusar, e ela só descobriria depois de digitar nome e
   * telefone.
   *
   * DESMARCAR TUDO É PERMITIDO. A alternativa — ignorar o toque no único serviço
   * marcado — é um botão que não responde, e a pessoa toca de novo achando que
   * a tela travou. Com zero, a lista de horários dá lugar a uma frase pedindo
   * que escolha um; e não se gasta consulta nenhuma no servidor.
   */
  function alternarServico(id: string) {
    const novo = servicoIds.includes(id)
      ? servicoIds.filter((x) => x !== id)
      : [...servicoIds, id]
    setServicoIds(novo)
    setEscolhido(null)
    setErro(null)
    if (novo.length) consultar(novo, { recarga: true, data: dados?.data })
  }

  // No celular o herói é o topo da tela inicial e some nos passos seguintes,
  // onde o espaço vale mais que a identidade — a pessoa já sabe onde está. No
  // computador ele fica na lateral, sempre visível, porque lá o espaço sobra.
  const heroiNoCelular = !pronto && !escolhido

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto grid w-full max-w-[1120px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={`lg:sticky lg:top-0 lg:h-[100dvh] lg:self-start lg:overflow-y-auto lg:border-r lg:border-border lg:bg-surface ${
            heroiNoCelular ? '' : 'hidden lg:block'
          }`}
        >
          <Heroi
            nome={nomeSalao}
            endereco={dados?.endereco}
            situacao={situacao}
            whatsapp={whatsapp}
            desistiu={!!erro}
          />
          <SemanaDeFuncionamento
            horario={dados?.horarioFuncionamento}
            agora={agora}
            className="hidden px-6 pb-8 pt-2 lg:block"
          />
        </aside>

        {/* `min-w-0` não é enfeite: item de grid nasce com `min-width: auto`, e
            aí a coluna estica até caber o conteúdo mais largo em vez de o
            conteúdo rolar dentro dela. Com a faixa de catorze dias (≈1100 px de
            botões) a coluna inteira ia a 1100 px, e quem rolava na horizontal
            era a página — cartão de serviço cortado, botão pela metade. */}
        <main className="min-w-0 px-4 pb-10 pt-5 lg:px-8 lg:pt-8">
          {pronto ? (
            <div className="surge mx-auto max-w-md space-y-3 rounded-xl border border-success/40 bg-surface p-5 shadow-[0_12px_32px_-16px_color-mix(in_srgb,var(--foreground)_40%,transparent)]">
              <div className="flex items-center gap-2 text-success">
                <Check size={20} />
                <h2 className="text-base font-semibold">Horário marcado!</h2>
              </div>
              <p className="text-sm text-foreground">
                <strong>{escolhido?.hora_local}</strong> com {escolhido?.profissional}
                {resumoDosServicos ? `, ${resumoDosServicos}` : ''}.
              </p>
              {tokenGestao ? (
                <p className="text-sm text-muted-foreground">
                  Precisou desmarcar?{' '}
                  <a
                    href={`/meu-horario/${tokenGestao}`}
                    className="font-medium text-primary underline"
                  >
                    Gerencie seu horário por este link
                  </a>{' '}
                  — salve nos favoritos ou tire um print.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  É só aguardar. Se precisar mudar alguma coisa, fale com a barbearia.
                </p>
              )}
            </div>
          ) : carregando ? (
            <div aria-busy="true" aria-label="Carregando os horários">
              <Esqueleto />
            </div>
          ) : !dados ? (
            <div className="mx-auto max-w-md">
              <ErroInline>{erro}</ErroInline>
              <FalarComABarbearia numero={whatsapp} />
            </div>
          ) : escolhido ? (
            // ---------- Passo 3: quem é você ----------
            <form onSubmit={agendar} className="surge mx-auto max-w-md space-y-4">
              <div className="rounded-xl border border-primary/40 bg-primary-soft/40 p-4">
                <div className="text-base font-semibold text-foreground">
                  {escolhido.hora_local} com {escolhido.profissional}
                </div>
                {servicosEscolhidos.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {resumoDosServicos} · R$ {precoTotal} · {duracaoTotal} min
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEscolhido(null)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  trocar horário
                </button>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Seu nome</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Seu WhatsApp</span>
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(41) 99999-9999"
                  inputMode="tel"
                  autoComplete="tel"
                  className="mt-1.5 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
                />
                <span className="mt-1.5 block text-[11px] text-muted-foreground">
                  É por aqui que a barbearia fala com você sobre esse horário.
                </span>
              </label>

              <ErroInline>{erro}</ErroInline>
              {erro && <FalarComABarbearia numero={whatsapp} />}

              <button
                type="submit"
                disabled={enviando}
                className="w-full btn-primary rounded-lg px-3 py-3.5 text-base font-semibold"
              >
                {enviando ? 'Marcando...' : 'Confirmar horário'}
              </button>
            </form>
          ) : dados.servicos.length === 0 ? (
            // Sem serviço não há passo 1: o seletor ficava vazio, sem uma opção,
            // e a frase de baixo mandava trocar de serviço (M8).
            <div className="mx-auto max-w-md rounded-lg border border-border p-4 text-sm text-muted-foreground">
              {mensagemSemHorario({
                motivo: 'sem_servicos',
                comoEncurtar: null,
                temWhatsapp: !!whatsapp,
                ehHoje: true,
                temOutroDia: false,
                diasNaJanela: faixa.length,
              })}
              <FalarComABarbearia numero={whatsapp} />
            </div>
          ) : (
            // ---------- Passos 1 e 2: serviço e horário ----------
            <div className="space-y-6">
              {/* A porta de quem JÁ tem horário, antes do passo 1.

                  POR QUE NO TOPO. O caminho já existia, mas só abria no fim:
                  quem quisesse desmarcar tinha de fingir que ia marcar,
                  escolher serviço, dia e hora, digitar nome e telefone, apertar
                  "Confirmar horário" e levar um "você já tem um horário" para
                  então achar o botão. Seis passos até a porta, encontrada por
                  errar. Aqui ela é o primeiro toque.

                  POR QUE DISCRETA. Quase todo mundo que abre o QR veio marcar,
                  não desmarcar. Traço pontilhado e texto apagado: quem procura
                  acha, quem não procura não tropeça. */}
              <FalarComABarbearia
                numero={whatsapp}
                forma="porta"
                mensagem="Oi! Já tenho um horário marcado e queria falar sobre ele."
              />

              <section>
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">O que você quer fazer?</h2>
                  <span className="text-xs text-muted-foreground">Pode escolher mais de um</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {dados.servicos.map((s) => {
                    const marcado = servicoIds.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={marcado}
                        // O DIA continua o mesmo ao trocar de serviço. Ser jogado
                        // de volta para hoje faria a pessoa refazer a escolha do
                        // dia a cada toque — e a duração muda a contagem de TODOS
                        // os dias da faixa, que é justamente o que ela compara.
                        onClick={() => alternarServico(s.id)}
                        className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-xl border-[1.5px] border-border bg-surface p-3.5 text-left transition-[border-color,background-color,transform] duration-150 hover:border-primary active:scale-[0.99] aria-pressed:border-primary aria-pressed:bg-primary-soft/50"
                      >
                        {/* Quadradinho, não bolinha: é a forma que diz "dá para
                            marcar vários". Com o círculo do rádio a pessoa
                            assume que escolher o segundo desmarca o primeiro. */}
                        <span
                          aria-hidden
                          className="row-span-2 flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] border-border-strong text-primary-foreground group-aria-pressed:border-primary group-aria-pressed:bg-primary"
                        >
                          {marcado && <Check size={13} strokeWidth={3} />}
                        </span>
                        <strong className="text-[15px] font-semibold text-foreground">{s.nome}</strong>
                        <span className="row-span-2 self-center text-base font-extrabold tabular-nums text-foreground">
                          R$ {s.preco}
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <Clock size={13} aria-hidden />
                          {s.duracao_minutos} min
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* O total só aparece a partir do segundo: com um serviço só ele
                    repetiria o preço que já está no cartão logo acima. */}
                {servicosEscolhidos.length > 1 && (
                  <p className="mt-2.5 flex items-center justify-between rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">{resumoDosServicos}</span>
                    <strong className="shrink-0 pl-3 font-bold tabular-nums text-foreground">
                      R$ {precoTotal} · {duracaoTotal} min
                    </strong>
                  </p>
                )}
              </section>

              <section
                aria-busy={atualizando}
                className={atualizando ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}
              >
                {/* A faixa dos catorze dias (etapa 2). Só aparece quando a edge
                    mandou a contagem — resposta de uma versão anterior devolve
                    a tela ao comportamento de um dia só, em vez de quebrar. */}
                {faixa.length > 0 && <FaixaDeDias faixa={faixa} atual={dados.data} aoEscolher={abrirDia} />}

                <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Clock size={15} aria-hidden />
                  {diaAberto ? `Horários livres ${diaAberto.porExtenso}` : 'Horários livres hoje'}
                </h2>

                {servicoIds.length === 0 ? (
                  // Desmarcou tudo. A lista que está na tela é a do serviço
                  // anterior e não vale mais para nada — mostrá-la ofereceria
                  // horários calculados para uma duração que ninguém escolheu.
                  <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">
                    Escolha ao menos um serviço acima para ver os horários.
                  </div>
                ) : dados.horarios.length === 0 ? (
                  <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    {mensagemSemHorario({
                      // Função anterior a isto não manda o motivo: cai no caso
                      // comum, e a frase continua verdadeira.
                      motivo: dados.motivoVazio ?? 'lotado',
                      // Com dois serviços marcados, "troque por um mais curto"
                      // é conselho para outra tela: o que faz caber é desmarcar
                      // um. Com um só, vale trocar — se existir outro menor.
                      comoEncurtar:
                        servicosEscolhidos.length > 1
                          ? 'tirar'
                          : dados.servicos.some((s) => s.duracao_minutos < duracaoTotal)
                            ? 'trocar'
                            : null,
                      temWhatsapp: !!whatsapp,
                      // Sem faixa (edge antiga) o dia olhado só pode ser hoje.
                      ehHoje: diaAberto ? diaAberto.ehHoje : true,
                      temOutroDia: temAlgumDiaLivre(faixa),
                      diasNaJanela: faixa.length,
                    })}
                    {/* A porta no lugar do beco: em vez de mandar a pessoa para
                        o WhatsApp por um dia cheio, leva ao próximo dia que tem
                        vaga. O WhatsApp volta a aparecer só quando a janela
                        inteira está sem nada — aí ele é a saída de verdade. */}
                    {proximoComVaga ? (
                      <button
                        type="button"
                        onClick={() => abrirDia(proximoComVaga.data)}
                        className="mt-3 flex w-full items-center justify-center gap-2 btn-primary rounded-lg px-3 py-3 text-sm font-semibold"
                      >
                        Ver {proximoComVaga.porExtenso}
                        <ArrowRight size={16} aria-hidden />
                      </button>
                    ) : (
                      <FalarComABarbearia numero={whatsapp} />
                    )}
                  </div>
                ) : (
                  <div key={`${servicoIds.join('-')}-${dados.data ?? 'hoje'}`} className="space-y-5">
                    {/* O mais cedo, em destaque. É o que quem está de pé no
                        balcão veio buscar, e era justamente o que ficava
                        enterrado sob quarenta linhas de rolagem. */}
                    {proximo && (
                      <button
                        type="button"
                        aria-pressed={ehOEscolhido(proximo)}
                        onClick={() => escolher(proximo)}
                        className="surge flex w-full items-center justify-between gap-3 rounded-2xl bg-primary p-3.5 text-left text-primary-foreground transition-transform duration-150 active:scale-[0.99]"
                      >
                        <span>
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-85">
                            {diaAberto?.ehHoje === false ? 'Primeiro horário do dia' : 'Próximo horário livre'}
                          </span>
                          <span className="mt-0.5 block text-[19px] font-extrabold tabular-nums">
                            {proximo.hora_local}
                          </span>
                          {/* O dia sai da faixa, não da palavra "hoje" fixa: com
                              catorze dias, esta linha dizia "hoje" na tela de
                              uma sexta-feira da semana que vem. */}
                          <span className="text-[13px] opacity-90">
                            {diaAberto?.porExtenso ?? 'hoje'} · com {proximo.profissional}
                          </span>
                        </span>
                        <ArrowRight size={20} aria-hidden className="shrink-0" />
                      </button>
                    )}

                    {agruparPorPeriodo(dados.horarios).map((periodo) => (
                      <div key={periodo.nome}>
                        <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <span>{periodo.nome}</span>
                          <span className="tabular-nums">{periodo.itens.length}</span>
                        </h3>
                        <div className="surge-stagger grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                          {periodo.itens.map((h, i) => (
                            <button
                              key={`${h.professional_id}-${h.inicio}`}
                              type="button"
                              style={{ '--i': i } as CSSProperties}
                              aria-pressed={ehOEscolhido(h)}
                              onClick={() => escolher(h)}
                              className="min-h-11 rounded-xl border-[1.5px] border-border bg-surface px-1 py-2 text-center transition-[border-color,background-color,transform] duration-150 hover:border-primary active:scale-[0.97] aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                            >
                              <span className="block text-[15px] font-bold tabular-nums text-inherit">
                                {h.hora_local}
                              </span>
                              {variosBarbeiros && (
                                <span className="block truncate text-[11px] text-inherit opacity-70">
                                  {h.profissional}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <ErroInline>{erro}</ErroInline>

              <SemanaDeFuncionamento
                horario={dados.horarioFuncionamento}
                agora={agora}
                className="rounded-xl border border-border bg-surface p-4 lg:hidden"
              />
            </div>
          )}

          {/* A assinatura. O Club Cut saiu do topo — a página é da barbearia —
              mas continua aqui, no tamanho de quem assina em vez de anunciar. */}
          <footer className="pt-7 text-center text-[11px] text-muted-foreground">
            <p>
              Ao agendar, você concorda com a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
                política de privacidade
              </a>
              .
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 opacity-70">
              <MarcaClubCut size={13} />
              Agenda por Club Cut
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}
