import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, MessageCircle, Smartphone, Wallet } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { DIAS_DE_TESTE, PRECO_BASICO, PRECO_PRO } from '../../lib/planos'
import { CONTATO } from '../../lib/contato'
import { ChatDemo } from './landing/ChatDemo'
import { ProvaRobo } from './landing/ProvaRobo'
import { ProdutoDemo } from './landing/ProdutoDemo'
import { Depoimentos } from './landing/Depoimentos'
import { FaqAccordion } from './landing/FaqAccordion'
import { Calculadora } from './landing/Calculadora'
import { CtaFixo } from './landing/CtaFixo'
import { Cta, Reveal, RevealGrupo, RevealItem } from './landing/primitivos'
import { useRolou } from './landing/useRolou'
import { FaixaBarbearias } from './landing/FaixaBarbearias'
import { ReguaScroll } from './landing/ReguaScroll'
import { MarcaClubCut } from '../../components/MarcaClubCut'

/**
 * Página de vendas — onde o anúncio e a prospecção caem.
 *
 * Fora do CRM e sem autenticação: quem chega aqui não tem conta. Todo caminho
 * leva ao mesmo lugar (`/criar-conta`), porque uma página com dois objetivos
 * não converte em nenhum.
 *
 * **Regra ao mexer no texto:** só entra o que o sistema faz hoje. Nada de site
 * institucional, recuperação de clientes ou relatório avançado — são coisas da
 * visão que não existem, e prometê-las aqui vira reclamação no primeiro dia de
 * uso. Os preços saem de `plans`; se a tabela mudar, este texto precisa mudar
 * junto.
 *
 * **A copy fala de perda, não de ganho.** "Agenda automática" é benefício de
 * catálogo e não mexe com ninguém; o corte que foi para o concorrente porque a
 * mensagem das 22h ficou sem resposta, sim. E fala com hora e número: "cliente
 * esperando" é abstração, "15h20 e a cadeira vazia" é uma cena que o dono já
 * viveu.
 *
 * **Uma decisão por seção.** Cada chamada para ação vem com a mesma microcopy
 * de risco embaixo, e a barra fixa se apaga quando qualquer uma delas está à
 * vista, para nunca haver dois botões disputando o mesmo olhar.
 *
 * **Um só elemento gritando.** O verde sólido aparece na chamada principal e
 * no plano recomendado, e em mais nada. Espalhado, ele deixa de significar
 * "é por aqui".
 *
 * ---------------------------------------------------------------------------
 * POSICIONAMENTO, e por que a página é escrita assim
 *
 * A categoria está lotada. Uma busca por "sistema de agendamento com IA para
 * barbearia" devolve uma dúzia de produtos com a MESMA lista de recursos
 * (agenda, WhatsApp, IA, financeiro, comissão, fidelidade) e a MESMA promessa:
 * "reduza até X% das faltas", com X indo de 50 a 90 conforme a página. Nenhum
 * publica de onde tirou o número, e todos usam "até", que permite dizer 70
 * quando o real foi 4.
 *
 * O Club Cut custa mais que a maioria deles, e isso é escolha, não descuido.
 * Uma página que promete a mesma coisa por três vezes o preço não fecha venda,
 * então ela não compete na mesma frase.
 *
 * Duas coisas sustentam o preço, e as duas já são verdade no produto:
 *
 * 1. O agente ASSUME QUE É AUTOMÁTICO quando perguntam, e sai da frente quando
 *    o dono entra na conversa. O concorrente faz o oposto: batiza o robô de
 *    gente. O medo real do dono não é "será que agenda?", é "e se falar besteira
 *    com meu cliente". Ninguém responde isso porque admitir risco atrapalha a
 *    venda — e é exatamente por isso que responder aqui separa.
 *
 * 2. A página NÃO PROMETE PERCENTUAL. Num mercado onde todos gritam um número
 *    inventado, ser o único que não grita é a coisa mais distinta possível. No
 *    lugar da promessa vem a calculadora, com os números do próprio dono.
 *
 * Ao mexer nesta página: não introduza percentual de resultado sem medição, e
 * não suavize a frase da seção `Franqueza`. As duas coisas são o produto.
 * ---------------------------------------------------------------------------
 */
const CTA = `Testar ${DIAS_DE_TESTE} dias grátis`
const MICROCOPY = 'Sem cartão. Cancela quando quiser.'

/**
 * Respiro entre seções.
 *
 * Era 150px em cima e embaixo, o que dava 300px de preto entre uma seção e a
 * seguinte. Espaço vazio só lê como respiro quando alguma coisa mora perto
 * dele; sozinho, do tamanho de meia tela, lê como página inacabada. `SECAO_APOIO`
 * é para as partes de serviço, que não precisam do mesmo palco.
 */
/*
   Superficie por secao. No escuro a elevacao vem do contraste base/cartao:
   secao com cartoes fica na base (o cartao salta), secao de texto puro fica na
   banda de superficie (o texto ganha um palco). A pagina alterna as duas.
*/
const SECAO = 'relative overflow-hidden px-6 py-[76px] lg:py-[104px]'
const SECAO_BRANCA = 'relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[76px] lg:py-[104px]'
const SECAO_APOIO = 'relative overflow-hidden px-6 py-[64px] lg:py-[84px]'
const CAIXA = 'relative z-[1] mx-auto max-w-[1180px]'

/**
 * Três níveis de título, e não um só.
 *
 * Seis seções no mesmo corpo de 54px faziam o olho descer a página sem nunca
 * ter motivo para acelerar ou desacelerar: os layouts variavam, o ritmo não.
 * O tamanho passa a dizer o que a seção pesa na decisão.
 *
 * DECISAO é onde a pessoa escolhe (o que o produto faz, quanto custa).
 * NARRATIVA é onde ela se reconhece ou vê a prova.
 * APOIO é serviço: consulta antes de decidir, não convence sozinho.
 */
const TITULO_DECISAO = 'landing-display text-[clamp(2rem,4.6vw,3.4rem)] text-[var(--l-fg)]'
const TITULO_NARRATIVA = 'landing-display text-[clamp(1.75rem,3.6vw,2.75rem)] text-[var(--l-fg)]'
const TITULO_APOIO = 'landing-display text-[clamp(1.5rem,2.6vw,2.05rem)] text-[var(--l-fg)]'

/**
 * Barra de navegação sem chamada para ação.
 *
 * O botão daqui competia com o do herói na mesma tela, e dois botões iguais na
 * mesma dobra fazem a pessoa escolher entre botões em vez de escolher o
 * produto. Quem já é cliente tem o "Entrar", que é outra intenção; quem não é
 * tem o botão grande logo abaixo e a barra fixa depois.
 */
function Navbar() {
  const rolou = useRolou(80)

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-300 ${
        rolou
          ? 'border-b border-[var(--l-line)] bg-[rgba(13,21,18,0.78)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
        <Link to="/inicio" className="-my-2 flex min-h-[44px] items-center gap-2.5 py-2">
          <MarcaClubCut size={32} />
          <span className="text-[17px] font-bold tracking-tight text-[var(--l-fg)]">Club Cut</span>
        </Link>

        {/* O cabecalho tinha links de navegacao sem landmark: leitor de tela
            nao tinha como pular para eles. E o alvo de toque subiu para 44px,
            que e o minimo para o dedo. */}
        <nav aria-label="Principal">
          <Link
            to="/login"
            className="-mx-3 inline-flex min-h-[44px] items-center px-3 text-[14px] font-medium text-[var(--l-fg-mute)] transition-colors duration-200 hover:text-[var(--l-fg)]"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-[88px] pt-[124px] lg:pb-[108px] lg:pt-[148px]">

      <div className={`${CAIXA} grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10`}>
        <div>
          {/* A sobrancelha existe para resolver um pronome orfao: o H1 comeca
              falando de "ele" e, no celular, o aparelho com a conversa fica
              abaixo da dobra. Sem esta linha, metade do trafego le um pronome
              sem dono como primeira palavra da pagina. */}
          <Reveal>
            <p className="landing-label text-[var(--l-fg-faint)]">
              Atendimento no WhatsApp para barbearia
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="landing-display mt-5 text-[clamp(2.6rem,6.6vw,5rem)] text-[var(--l-fg)]">
              Suas mãos estão ocupadas. As <em className="landing-serif">dele</em> não.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-8 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
              Ele responde a mensagem das 22h na hora, marca na agenda, e devolve a conversa no
              segundo em que você larga a máquina. Se o cliente perguntar se é robô, ele responde
              que é.
            </p>
          </Reveal>

          <Reveal delay={0.17}>
            <Cta className="mt-11" microcopy={MICROCOPY}>
              {CTA}
            </Cta>
          </Reveal>
        </div>

        <Reveal delay={0.22}>
          <ChatDemo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const DORES = [
  'Está com a máquina na mão e o celular toca. Ou você para o corte, ou o cliente espera, e às vezes desiste.',
  'Marcou alguém às 15h. Às 15h20 a cadeira continua vazia, e aquele horário não volta.',
  'Alguém perguntou o preço da barba às 22h. Você respondeu no dia seguinte, e ele já tinha cortado em outro lugar.',
]

/**
 * As três cenas do dia ruim.
 *
 * É a melhor copy da página, e estava com o tratamento mais fraco: cinza
 * apagado, 22px, encostada na margem esquerda com metade da tela vazia à
 * direita. Passou a ser lida como o que é, o momento em que o dono se
 * reconhece, e não como uma lista de apoio.
 *
 * **A numeração saiu.** As três cenas são paralelas, não uma sequência: o
 * celular tocando durante o corte não vem antes da cadeira vazia das 15h20.
 * Numerar ali era enfeite vestido de estrutura, e gastava o significado que o
 * número tem em "Como começa", onde a ordem é informação de verdade.
 *
 * A alternância de lado ocupa a metade direita que sobrava e mantém as três no
 * mesmo peso, sem sugerir ordem, que é o que uma escada de recuo faria.
 */
function Dor() {
  return (
    <section className={SECAO_BRANCA}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>Não é falta de <em className="landing-serif">jeito</em>. É que suas mãos estavam ocupadas.</h2>
        </Reveal>

        <RevealGrupo className="mt-12 flex flex-col gap-10 sm:gap-14" intervalo={0.11}>
          {DORES.map((d, i) => (
            <RevealItem key={d}>
              <p
                className={`max-w-[30ch] text-[clamp(1.3rem,2.9vw,2rem)] font-medium leading-[1.32] tracking-[-0.02em] text-[var(--l-fg)] ${
                  i % 2 === 1 ? 'sm:ml-auto sm:text-right' : ''
                }`}
              >
                {d}
              </p>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/** Cada texto carrega uma hora ou um número: a cena convence, o adjetivo não. */
const RECURSOS = [
  {
    icone: MessageCircle,
    titulo: 'Atende no WhatsApp, sozinho',
    texto:
      'Responde preço, horário e o que a barbearia faz. Marca, remarca e cancela. Às 23h40 de um domingo, ele responde igual.',
    largo: true,
  },
  {
    icone: CalendarCheck,
    titulo: 'Agenda que não deixa furo',
    texto:
      'Corte de 40 minutos às 10h termina 10h40, e é 10h40 que aparece livre para o próximo. Nada marcado por cima de nada.',
    largo: false,
  },
  {
    icone: Smartphone,
    titulo: 'Você sabe da falta às 14h50',
    texto:
      'Uma hora antes, o lembrete pergunta se ele vem. Dez minutos antes, um "está a caminho?". Dá tempo de chamar outro.',
    largo: false,
  },
  {
    icone: Wallet,
    titulo: 'O dinheiro do dia, fechado',
    texto:
      'Comanda, caixa e a comissão de cada barbeiro calculada sozinha. Você fecha o dia sabendo quanto entrou e quanto é de cada um.',
    largo: true,
  },
]

/** Bento: células de tamanhos diferentes. Quatro cards iguais seriam o template. */
function Recursos() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_DECISAO}>O que ele faz enquanto você <em className="landing-serif">corta</em></h2>
        </Reveal>

        <RevealGrupo className="mt-11 grid gap-4 md:grid-cols-3">
          {RECURSOS.map((f) => (
            <RevealItem key={f.titulo} className={f.largo ? 'md:col-span-2' : ''}>
              <div className="card h-full rounded-[var(--r-md)] p-7 sm:p-9">
                {/* Icone decorativo: o titulo do card ja diz tudo. Sem aria-hidden o
                    leitor de tela anuncia um grafico sem nome antes do texto. */}
                <f.icone
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="text-[var(--l-accent-ink)]"
                />
                <h3 className="mt-7 text-[21px] font-semibold tracking-[-0.015em] text-[var(--l-fg)]">
                  {f.titulo}
                </h3>
                <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
                  {f.texto}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A franqueza, dita em voz alta.
 *
 * É o posicionamento inteiro numa frase. A categoria vende o contrário: o
 * concorrente batiza o robô de "Jarvis" e trabalha para que o cliente ache que
 * está falando com gente.
 *
 * O medo real do dono não é "será que agenda?", é "e se falar besteira com meu
 * cliente e me queimar?". Nenhum concorrente responde isso, porque admitir
 * risco atrapalha a venda. É justamente por isso que responder aqui separa o
 * Club Cut do resto — e é o que sustenta cobrar mais.
 *
 * Sem card e sem ícone de propósito: a frase é a peça.
 */
function Franqueza() {
  return (
    <section className="relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[72px] lg:py-[96px]">
      <div className={`${CAIXA} grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10`}>
        <Reveal>
          <p className="max-w-[19ch] text-[clamp(1.6rem,4vw,2.9rem)] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--l-fg)]">
            Se o cliente perguntar se é robô, ele responde que é.
          </p>
          <p className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            A gente não acha certo enganar o seu cliente. Ele escreve como gente, atende como gente,
            e quando perguntam, não mente. É o seu nome na conversa.
          </p>

          {/*
            Prova falsificavel, e a unica prova que esta pagina pode dar hoje:
            em vez de AFIRMAR que ele assume ser robo, deixa a pessoa testar.
            Custa nada e nenhum concorrente copia sem expor que o bot dele mente.

            So aparece com numero real em CONTATO. Convite para conversar com um
            numero que nao existe seria pior que nao convidar.
          */}
          {CONTATO.whatsapp && (
            <p className="mt-7 text-[17px] leading-relaxed text-[var(--l-fg)]">
              Não acredita?{' '}
              <a
                href={`https://wa.me/${CONTATO.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--l-accent-ink)] decoration-2 underline-offset-4 transition-colors duration-200 hover:text-[var(--l-accent-ink)]"
              >
                Manda mensagem pro nosso número e pergunta.
              </a>
            </p>
          )}
        </Reveal>

        {/*
          Enquanto o numero real de CONTATO nao existe, esta e a prova que dá
          para mostrar: a mesma pergunta e a mesma resposta, encenadas — não
          um convite para testar um numero que nao existe, mas também não a
          frase sozinha sobre metade da tela vazia.
        */}
        <Reveal delay={0.1}>
          <ProvaRobo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A agenda e o caixa por dentro.
 *
 * É a prova de que existe um sistema atrás do bot, e estava no mesmo container
 * de 1180px do texto, comprimida e fácil de passar batido. Ganhou um container
 * mais largo que o resto da página: a peça é para ser OLHADA, e largura é o que
 * dá tempo de olhar.
 *
 * O halo atrás separa a demonstração do texto ao redor sem precisar de um
 * fundo diferente, que quebraria a continuidade do ambiente escuro.
 */
function PorDentro() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>E do seu lado, fica <em className="landing-serif">assim</em></h2>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            O que ele marca cai direto na agenda, e o que você atende fecha no caixa.
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="relative z-[1] mx-auto mt-12 max-w-[1360px]">
        <ProdutoDemo />
      </Reveal>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A mesma cena, com e sem.
 *
 * As três linhas são as três dores da abertura, fechadas: a mensagem das 22h,
 * a falta das 15h20 e o caixa no fim do dia. A página abre o problema lá em
 * cima e fecha ele aqui, com o produto no meio — é prova por comportamento,
 * não por número.
 *
 * **Cada célula descreve só o que o sistema faz hoje.** Nenhuma promete
 * resultado ("recupera o cliente", "reduz a falta"): descrevem o que acontece
 * mecanicamente, que é verificável no teste grátis. A regra da página vale
 * aqui em dobro, porque tabela dá cara de fato a qualquer frase.
 */
const COMPARACAO: Array<[cena: string, sem: string, com: string]> = [
  [
    'Mensagem às 22h',
    'Fica para amanhã. Às vezes o cliente também.',
    'Respondida na hora, com preço e horário livre.',
  ],
  [
    'Cliente não aparece',
    'Você descobre olhando para a cadeira vazia.',
    'Lembrete 1h antes pergunta se ele vem. Você sabe antes.',
  ],
  [
    'Fim do dia',
    'Comanda de papel, comissão de cabeça.',
    'Caixa fechado e a comissão de cada um, calculada.',
  ],
]

function ComSem() {
  return (
    <section className={`${SECAO_APOIO} bg-[var(--l-canvas)]`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>
            O mesmo dia, <em className="landing-serif">duas</em> versões
          </h2>
        </Reveal>

        <RevealGrupo className="mt-11 overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line)]">
          {/* Cabeçalho da tabela, em etiqueta mono. */}
          <div className="hidden grid-cols-[0.8fr_1fr_1fr] gap-6 border-b border-[var(--l-line)] bg-[var(--l-bg)] px-7 py-4 sm:grid">
            <span className="landing-label text-[var(--l-fg-faint)]">A cena</span>
            <span className="landing-label text-[var(--l-fg-faint)]">Sem</span>
            <span className="landing-label text-[var(--l-accent-ink)]">Com o Club Cut</span>
          </div>

          {COMPARACAO.map(([cena, sem, com], i) => (
            <RevealItem key={cena}>
              <div
                className={`grid gap-3 px-7 py-6 sm:grid-cols-[0.8fr_1fr_1fr] sm:gap-6 ${
                  i > 0 ? 'border-t border-[var(--l-line)]' : ''
                }`}
              >
                <span className="text-[15px] font-semibold text-[var(--l-fg)]">{cena}</span>
                <span className="text-[15px] leading-relaxed text-[var(--l-fg-faint)]">
                  <span className="landing-label mr-2 inline sm:hidden">Sem —</span>
                  {sem}
                </span>
                <span className="text-[15px] leading-relaxed text-[var(--l-fg)]">
                  <span className="landing-label mr-2 inline text-[var(--l-accent-ink)] sm:hidden">
                    Com —
                  </span>
                  {com}
                </span>
              </div>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const PASSOS = [
  ['Crie sua conta', 'E-mail e senha. Você confirma pelo e-mail e já entra.'],
  [
    'Conecte seu WhatsApp',
    'Você lê um QR code com o celular da barbearia, o mesmo número que seus clientes já usam. Não precisa de número novo.',
  ],
  [
    'Ajuste o que não servir',
    'A barbearia já vem com horário e serviços preenchidos. Você muda preço, duração e horário em dois minutos.',
  ],
]

/**
 * Os três passos, com o trilho preenchendo conforme a pessoa desce.
 *
 * Ver o quanto falta para o fim é o que faz alguém terminar: um passo que já
 * está pela metade motiva mais do que três passos parados. O trilho preenche em
 * `scaleY` e não em `height` para não recalcular layout a cada quadro de scroll.
 */
function ComoComeca() {
  const ref = useRef<HTMLOListElement>(null)
  const semMovimento = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 78%', 'end 65%'],
  })
  const preenchimento = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    restDelta: 0.001,
  })

  return (
    <section className={`${SECAO_APOIO} bg-[var(--l-canvas)]`}>
      <div className={`${CAIXA} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
        <Reveal>
          <h2 className={TITULO_APOIO}>Como <em className="landing-serif">começa</em></h2>
          <p className="mt-6 max-w-[34ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            Três passos. O mais demorado leva dois minutos.
          </p>
        </Reveal>

        <ol ref={ref} className="relative flex flex-col">
          {/* Trilho de fundo e trilho preenchido, um sobre o outro. */}
          <span className="absolute bottom-10 left-[19px] top-10 w-px bg-[var(--l-line)]" />
          <motion.span
            className="absolute bottom-10 left-[19px] top-10 w-px origin-top bg-[var(--l-accent)]"
            style={{ scaleY: semMovimento ? 1 : preenchimento }}
          />

          {PASSOS.map(([titulo, texto], i) => (
            <PassoNaLinha
              key={titulo}
              indice={i}
              total={PASSOS.length}
              titulo={titulo}
              texto={texto}
              progresso={preenchimento}
              semMovimento={!!semMovimento}
            />
          ))}
        </ol>
      </div>
    </section>
  )
}

function PassoNaLinha({
  indice,
  total,
  titulo,
  texto,
  progresso,
  semMovimento,
}: {
  indice: number
  total: number
  titulo: string
  texto: string
  progresso: ReturnType<typeof useSpring>
  semMovimento: boolean
}) {
  // O passo acende quando o preenchimento chega nele. Como opacidade de uma
  // camada por cima, e não troca de classe: assim o valor contínuo do scroll
  // não vira estado do React.
  const inicio = indice / total
  const aceso = useTransform(progresso, [inicio, inicio + 0.5 / total], [0, 1])

  return (
    <li className="relative flex gap-6 pb-11 last:pb-0">
      <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--l-line-strong)] bg-[var(--l-bg)] text-[14px] font-bold text-[var(--l-fg-mute)]">
        {indice + 1}
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--l-accent)] text-[var(--l-on-accent)]"
          style={{ opacity: semMovimento ? 1 : aceso }}
        >
          {indice + 1}
        </motion.span>
      </span>
      <div className="pt-1.5">
        <div className="text-[19px] font-semibold tracking-[-0.015em] text-[var(--l-fg)]">
          {titulo}
        </div>
        <p className="mt-2.5 max-w-[46ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
          {texto}
        </p>
      </div>
    </li>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * O número que a gente não vai prometer.
 *
 * Todo concorrente da categoria lidera com "reduza até X% das faltas", e o X
 * escala de 50 a 90 conforme a página. Nenhum publica de onde saiu, e o "até"
 * é a palavra que deixa dizer 70 quando o real foi 4.
 *
 * Recusar esse número parecia fraqueza nossa, porque a página ficava sem prova.
 * É o contrário: num mercado onde todos gritam um percentual inventado, ser o
 * único que não grita é a coisa mais distinta que dá para fazer. E a
 * calculadora entrega a alternativa honesta na mesma tela, senão a recusa
 * ficaria sendo só crítica sem oferta.
 *
 * Nenhum concorrente é citado pelo nome de propósito. A afirmação é sobre a
 * prática da categoria, que é verificável em qualquer busca, e não sobre uma
 * empresa específica.
 */
function SemPromessa() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_NARRATIVA}>Não vamos <em className="landing-serif">prometer</em> 70%</h2>
          <div className="mt-7 flex max-w-[54ch] flex-col gap-5 text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            <p>
              Você vai ver esse número por aí, e as variações dele: menos 50%, menos 70%, menos 90%
              de falta. Pergunte de onde saiu.
            </p>
            <p>
              A gente não tem esse número. Ninguém mediu a sua barbearia, e o que acontece numa não
              acontece igual na outra. O que dá para fazer é a conta com os seus números.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <Calculadora />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const BASICO = [
  'Ele atende no WhatsApp que a barbearia já tem',
  'A agenda e quem já cortou com você',
  'O caixa do dia e a comissão de cada um',
  'Seus serviços, seus preços, sua duração',
]

function Preco() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_DECISAO}>Quanto <em className="landing-serif">custa</em></h2>
          {/* A âncora. Vem antes do preço de propósito: comparado com uma
              cadeira vazia por semana, a mensalidade deixa de ser o número
              grande da tela. */}
          <p className="mt-7 max-w-[24ch] text-[clamp(1.4rem,2.8vw,2rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--l-fg)]">
            Tem sistema de barbearia por R$ 49. A gente sabe. E uma cadeira vazia por semana
            custa mais que os dois.
          </p>
        </Reveal>

        <RevealGrupo className="mt-11 grid gap-4 lg:grid-cols-2" intervalo={0.1}>
          <RevealItem>
            <div className="card h-full rounded-[var(--r-md)] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10">
              <div className="landing-label text-[var(--l-fg-mute)]">Básico</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[19px] text-[var(--l-fg-mute)]">R$</span>
                <span className="landing-num text-[52px] text-[var(--l-fg)]">{PRECO_BASICO}</span>
                <span className="text-[15px] text-[var(--l-fg-faint)]">/mês</span>
              </div>
              <ul className="mt-9 flex flex-col gap-3.5">
                {BASICO.map((i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-[var(--l-fg-mute)]">
                    <Check
                      size={17}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[var(--l-accent-ink)]"
                    />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </RevealItem>

          {/* O plano recomendado é o único cartão claro da página inteira.
              É o carimbo, e ele só significa destaque porque não se repete. */}
          <RevealItem>
            <div className="card-tinta relative h-full rounded-[var(--r-md)] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10">
              <span className="absolute right-8 top-8 landing-label rounded-full bg-[var(--l-accent)] px-3 py-1.5 text-[var(--l-on-accent)]">
                O que a gente recomenda
              </span>
              <div className="landing-label opacity-75">Pro</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[19px] opacity-75">R$</span>
                <span className="landing-num text-[52px]">{PRECO_PRO}</span>
                <span className="text-[15px] opacity-70">/mês</span>
              </div>
              <ul className="mt-9 flex flex-col gap-3.5 text-[15px]">
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} aria-hidden="true" className="mt-0.5 shrink-0" />
                  Tudo do Básico
                </li>
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>
                    <strong className="font-semibold">Lembrete 1h antes</strong>, perguntando se o
                    cliente confirma
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>
                    <strong className="font-semibold">Confirmação 10 min antes</strong>, para você
                    saber do atraso antes da cadeira esfriar
                  </span>
                </li>
              </ul>
            </div>
          </RevealItem>
        </RevealGrupo>

        <Reveal delay={0.14}>
          <Cta
            className="mt-14"
            microcopy={`${MICROCOPY} No teste você usa o Pro completo.`}
          >
            {CTA}
          </Cta>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const PERGUNTAS = [
  [
    'Preciso de um número novo de WhatsApp?',
    'Não. Você usa o número que a barbearia já tem. É só ler um QR code, como no WhatsApp Web.',
  ],
  [
    'E se eu quiser responder eu mesmo?',
    'É só responder. Ele percebe e sai da frente naquela conversa, até você devolver para ele.',
  ],
  [
    'O cliente vai perceber que é automático?',
    'Se ele perguntar, ele assume que é automático. A gente não acha certo enganar o seu cliente. Fora isso, ele escreve como gente.',
  ],
  [
    'Tem fidelidade?',
    `Não. São ${DIAS_DE_TESTE} dias grátis sem cartão, e depois você cancela quando quiser pelo próprio sistema. Se cancelar, usa até o fim do mês que já pagou.`,
  ],
  [
    'Funciona com mais de um barbeiro?',
    'Sim. Cada um tem o próprio horário e a própria comissão, e o cliente pode escolher com quem quer cortar.',
  ],
  /*
    As tres perguntas abaixo entraram porque eram as objecoes que a pagina
    deixava o leitor formular sozinho, na cabeca dele, sem ninguem para
    responder. A do preco e a mais cara: quem viu R$ 49 no concorrente e nao
    ouve nada sobre isso simplesmente fecha a aba.
  */
  [
    `Por que custa mais que os outros?`,
    'Porque não é um robô com respostas prontas. Ele entende quando o cliente muda de ideia no meio da conversa, e sai da frente sozinho quando você entra. Nos ' +
      `${DIAS_DE_TESTE} dias você compara com qualquer outro sem pagar nada.`,
  ],
  [
    'Vou perder o jeito pessoal do meu atendimento?',
    'A conversa continua sua. Ele responde o que é sempre igual — preço, horário, o que a barbearia faz — e te devolve o cliente na hora em que você entra. O papo que importa continua sendo com você.',
  ],
  [
    'E se der problema no meio do sábado?',
    'O suporte é por WhatsApp, com resposta em até 1 dia útil. E se ele parar, o WhatsApp continua sendo o seu: as mensagens chegam normalmente e você responde como sempre respondeu.',
  ],
]

function Faq() {
  return (
    <section className={`${SECAO_APOIO} bg-[var(--l-canvas)]`}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO_APOIO}>Perguntas que todo <em className="landing-serif">dono</em> faz</h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <FaqAccordion itens={PERGUNTAS.map(([pergunta, resposta]) => ({ pergunta, resposta }))} />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Fecho() {
  return (
    <section className="relative overflow-hidden px-6 py-[100px] text-center lg:py-[132px]">
      <div className={CAIXA}>
        <Reveal>
          <h2 className="landing-display mx-auto max-w-[17ch] text-[clamp(2.4rem,6vw,4.6rem)] text-[var(--l-fg)]">
            Amanhã às 22h alguém vai te mandar <em className="landing-serif">mensagem</em>.
          </h2>
        </Reveal>
        <Reveal delay={0.09}>
          <p className="mx-auto mt-8 max-w-[42ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
            Em {DIAS_DE_TESTE} dias dá tempo de ver ele responder, marcar, e o cliente aparecer
            na cadeira.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <Cta className="mt-12" microcopy={MICROCOPY}>
            {CTA}
          </Cta>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Rodapé em três colunas: marca, produto e suporte.
 *
 * Os canais de contato leem de `CONTATO` e só aparecem quando o canal real
 * existe. Um "fale conosco" apontando para lugar nenhum é pior que nenhum:
 * alguém escreve, ninguém responde, e a página que promete "responde na hora"
 * vira piada.
 */
function Rodape() {
  /* `min-h-[44px]` e o minimo de alvo de toque. Os links do rodape tinham
     21px de altura -- meio dedo. O recuo negativo mantem o alinhamento
     visual da coluna enquanto a area clicavel cresce. */
  const linkClasse =
    '-mx-2 inline-flex min-h-[44px] items-center px-2 text-[14px] text-[var(--l-fg-mute)] transition-colors duration-200 hover:text-[var(--l-fg)]'

  const suporte = [
    CONTATO.whatsapp && {
      href: `https://wa.me/${CONTATO.whatsapp}`,
      rotulo: 'Suporte no WhatsApp',
      externo: true,
    },
    CONTATO.email && { href: `mailto:${CONTATO.email}`, rotulo: CONTATO.email, externo: true },
    CONTATO.instagram && {
      href: `https://instagram.com/${CONTATO.instagram}`,
      rotulo: `@${CONTATO.instagram}`,
      externo: true,
    },
  ].filter(Boolean) as Array<{ href: string; rotulo: string; externo: boolean }>

  return (
    <footer className="relative z-[1] border-t border-[var(--l-line)] bg-[var(--l-canvas)] px-6 pb-10 pt-14">
      <div className="mx-auto grid max-w-[1180px] gap-10 sm:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2.5 text-[16px] font-bold text-[var(--l-fg)]">
            <MarcaClubCut size={32} />
            Club Cut
          </span>
          <p className="mt-4 max-w-[30ch] text-[13.5px] leading-relaxed text-[var(--l-fg-faint)]">
            Atendimento, agenda e caixa para barbearia, no WhatsApp que ela já tem.
          </p>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <span className="landing-label text-[var(--l-fg-faint)]">Produto</span>
          {[
            ['/criar-conta', CTA],
            ['/login', 'Entrar'],
            ['/termos', 'Termos de uso'],
            ['/privacidade', 'Privacidade'],
          ].map(([href, rotulo]) => (
            <Link key={href} to={href} className={linkClasse}>
              {rotulo}
            </Link>
          ))}
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <span className="landing-label text-[var(--l-fg-faint)]">Suporte</span>
          {suporte.length > 0 ? (
            suporte.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className={linkClasse}
              >
                {s.rotulo}
              </a>
            ))
          ) : (
            <p className="max-w-[26ch] text-[13.5px] leading-relaxed text-[var(--l-fg-faint)]">
              O suporte é feito por WhatsApp, dentro do sistema, com resposta em até 1 dia útil.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-[var(--l-line)] pt-6">
        <span className="landing-label text-[var(--l-fg-faint)]">
          © {new Date().getFullYear()} Club Cut
        </span>
        <span className="landing-label text-[var(--l-fg-faint)]">criado pela Aura</span>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

export function VendasPage() {
  return (
    <div className="landing min-h-[100dvh]">
      <ReguaScroll />
      <Navbar />
      <main>
        <Hero />
        {/* Fecha o heroi. Marca onde a barbearia comeca. */}
        <div className="regua-poste" aria-hidden="true" />
        {/* A primeira prova da pagina. Antes disso, so afirmacao nossa. */}
        <FaixaBarbearias />
        <Dor />
        <Recursos />
        <Franqueza />
        <PorDentro />
        <ComSem />
        <Depoimentos />
        <ComoComeca />
        <SemPromessa />
        <Preco />
        <Faq />
        <Fecho />
      </main>
      <div className="regua-poste" aria-hidden="true" />
      <Rodape />

      {/* Aparece depois do herói e se apaga perto de qualquer CTA de seção. */}
      <CtaFixo rotulo={CTA} microcopy={MICROCOPY} />
    </div>
  )
}
