import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, MessageCircle, Scissors, Smartphone, Wallet } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { DIAS_DE_TESTE, PRECO_BASICO, PRECO_PRO } from '../../lib/planos'
import { ChatDemo } from './landing/ChatDemo'
import { ProdutoDemo } from './landing/ProdutoDemo'
import { Depoimentos } from './landing/Depoimentos'
import { FaqAccordion } from './landing/FaqAccordion'
import { Calculadora } from './landing/Calculadora'
import { CtaFixo } from './landing/CtaFixo'
import { Contador, Cta, Reveal, RevealGrupo, RevealItem } from './landing/primitivos'
import { useRolou } from './landing/useRolou'

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
 * **Um só elemento gritando.** O laranja sólido aparece na chamada principal e
 * no plano recomendado, e em mais nada. Espalhado, ele deixa de significar
 * "é por aqui".
 */
const CTA = `Testar ${DIAS_DE_TESTE} dias grátis`
const MICROCOPY = 'Sem cartão. Cancela quando quiser.'

const SECAO = 'relative overflow-hidden px-6 py-[104px] lg:py-[150px]'
const CAIXA = 'relative z-[1] mx-auto max-w-[1180px]'
const TITULO = 'landing-display text-[clamp(2rem,4.6vw,3.4rem)] text-[var(--l-fg)]'

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
          ? 'border-b border-[var(--l-line)] bg-[rgba(10,9,8,0.72)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
        <Link to="/inicio" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--l-accent-deep)] text-white">
            <Scissors size={16} strokeWidth={1.9} />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-[var(--l-fg)]">Club Cut</span>
        </Link>

        <Link
          to="/login"
          className="text-[14px] font-medium text-[var(--l-fg-mute)] transition-colors duration-200 hover:text-[var(--l-fg)]"
        >
          Entrar
        </Link>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-[104px] pt-[132px] lg:pb-[140px] lg:pt-[168px]">
      {/* Duas fontes de luz: uma atrás do texto, outra atrás do aparelho. É o
          que impede o quase-preto de ler como fundo chapado. */}
      <div
        className="glow left-[-16%] top-[-14%] h-[560px] w-[720px]"
        style={{ '--glow-tint': 'rgba(224,138,60,0.15)' } as React.CSSProperties}
      />
      <div
        className="glow right-[-10%] top-[8%] h-[520px] w-[560px]"
        style={{ '--glow-tint': 'rgba(224,138,60,0.1)' } as React.CSSProperties}
      />

      <div className={`${CAIXA} grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10`}>
        <div>
          <Reveal>
            <h1 className="landing-display text-[clamp(2.9rem,7.4vw,5.6rem)] text-[var(--l-fg)]">
              O cliente não espera
            </h1>
          </Reveal>

          <Reveal delay={0.09}>
            <p className="mt-8 max-w-[45ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
              Mensagem às 22h respondida no outro dia vira corte na concorrência. O Club Cut
              responde na hora e já marca na agenda.
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

/** Sem cards: as frases são o conteúdo, e caixa em volta só as afastaria da leitura. */
function Dor() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO}>Você conhece esse dia</h2>
        </Reveal>

        <RevealGrupo className="mt-14 flex flex-col" intervalo={0.09}>
          {DORES.map((d, i) => (
            <RevealItem key={d}>
              <div className="grid gap-5 border-t border-[var(--l-line)] py-8 sm:grid-cols-[64px_1fr] sm:gap-10 sm:py-10">
                <span className="landing-num text-[15px] text-[var(--l-accent)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="max-w-[52ch] text-[19px] leading-[1.5] text-[var(--l-fg-mute)] sm:text-[22px]">
                  {d}
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
      <div
        className="glow right-[-14%] top-[6%] h-[520px] w-[620px]"
        style={{ '--glow-tint': 'rgba(224,138,60,0.09)' } as React.CSSProperties}
      />
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO}>O que o Club Cut faz</h2>
        </Reveal>

        <RevealGrupo className="mt-14 grid gap-4 md:grid-cols-3">
          {RECURSOS.map((f) => (
            <RevealItem key={f.titulo} className={f.largo ? 'md:col-span-2' : ''}>
              <div className="glass h-full rounded-[22px] p-7 sm:p-9">
                <f.icone size={20} strokeWidth={1.5} className="text-[var(--l-accent)]" />
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

function PorDentro() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO}>E do seu lado, fica assim</h2>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)]">
            O que o agente marca cai direto na agenda, e o que você atende fecha no caixa.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <ProdutoDemo />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Números do produto.
 *
 * São fatos verificáveis do sistema, e não métricas de adoção. Contador de
 * "barbearias ativas" ou "faltas evitadas" precisaria de número real; inventado,
 * seria alegação falsa numa página que vende para gente de verdade.
 */
const NUMEROS = [
  { ate: 24, sufixo: 'h', rotulo: 'atendendo, todo dia' },
  { ate: DIAS_DE_TESTE, sufixo: '', rotulo: 'dias de teste, sem cartão' },
  { ate: 1, sufixo: 'h', rotulo: 'antes, o lembrete sai' },
  { ate: 10, sufixo: 'min', rotulo: 'antes, a confirmação' },
]

function Numeros() {
  return (
    <section className="relative overflow-hidden px-6 py-[88px] lg:py-[112px]">
      <div className={CAIXA}>
        <RevealGrupo
          className="grid gap-10 border-y border-[var(--l-line)] py-14 sm:grid-cols-2 lg:grid-cols-4"
          intervalo={0.08}
        >
          {NUMEROS.map((n) => (
            <RevealItem key={n.rotulo}>
              <div className="landing-num text-[clamp(2.6rem,5vw,3.6rem)] text-[var(--l-accent)]">
                <Contador ate={n.ate} sufixo={n.sufixo} />
              </div>
              <div className="mt-3 max-w-[22ch] text-[14px] leading-snug text-[var(--l-fg-mute)]">
                {n.rotulo}
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
    <section className={SECAO}>
      <div className={`${CAIXA} grid gap-14 lg:grid-cols-[0.8fr_1.2fr]`}>
        <Reveal>
          <h2 className={TITULO}>Como começa</h2>
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
      <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--l-line-strong)] bg-[var(--l-bg-lift)] text-[14px] font-bold text-[var(--l-fg-mute)]">
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

const BASICO = [
  'Atendimento automático no WhatsApp',
  'Agenda e clientes',
  'Financeiro e comissão',
  'Catálogo de serviços',
]

function Preco() {
  return (
    <section className={SECAO}>
      <div
        className="glow left-1/2 top-1/4 h-[620px] w-[860px] -translate-x-1/2"
        style={{ '--glow-tint': 'rgba(224,138,60,0.11)' } as React.CSSProperties}
      />
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO}>Quanto custa</h2>
          {/* A âncora. Vem antes do preço de propósito: comparado com uma
              cadeira vazia por semana, a mensalidade deixa de ser o número
              grande da tela. */}
          <p className="mt-7 max-w-[24ch] text-[clamp(1.4rem,2.8vw,2rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--l-fg)]">
            Uma cadeira vazia por semana já custa mais que isso.
          </p>
        </Reveal>

        {/* E aqui o dono confere a frase acima com os números dele, antes de
            ver a mensalidade. A âncora deixa de ser algo que a página afirma e
            vira uma conta que ele mesmo fez. */}
        <Reveal delay={0.08} className="mt-12">
          <Calculadora />
        </Reveal>

        <RevealGrupo className="mt-14 grid gap-4 lg:grid-cols-2" intervalo={0.1}>
          <RevealItem>
            <div className="glass h-full rounded-[24px] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10">
              <div className="text-[15px] font-semibold text-[var(--l-fg-mute)]">Básico</div>
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
                      className="mt-0.5 shrink-0 text-[var(--l-accent)]"
                    />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </RevealItem>

          {/* O plano recomendado é o único bloco em laranja sólido da página.
              É o carimbo, e ele só significa destaque porque não se repete. */}
          <RevealItem>
            <div className="relative h-full rounded-[24px] bg-[var(--l-accent)] p-8 text-[var(--l-on-accent)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_0_70px_-14px_rgba(224,138,60,0.6)] sm:p-10">
              <span className="absolute right-8 top-8 rounded-full bg-[var(--l-on-accent)]/14 px-3 py-1 text-[11px] font-bold">
                Mais escolhido
              </span>
              <div className="text-[15px] font-semibold opacity-75">Pro</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[19px] opacity-75">R$</span>
                <span className="landing-num text-[52px]">{PRECO_PRO}</span>
                <span className="text-[15px] opacity-70">/mês</span>
              </div>
              <ul className="mt-9 flex flex-col gap-3.5 text-[15px]">
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                  Tudo do Básico
                </li>
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                  <span>
                    <strong className="font-semibold">Lembrete 1h antes</strong>, perguntando se o
                    cliente confirma
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check size={17} strokeWidth={2.4} className="mt-0.5 shrink-0" />
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
    'É só responder. O atendimento automático percebe e sai da frente naquela conversa, até você devolver para ele.',
  ],
  [
    'O cliente vai perceber que é automático?',
    'Se ele perguntar, o atendimento assume que é automático. A gente não acha certo enganar o seu cliente. Fora isso, ele escreve como gente.',
  ],
  [
    'Tem fidelidade?',
    `Não. São ${DIAS_DE_TESTE} dias grátis sem cartão, e depois você cancela quando quiser pelo próprio sistema. Se cancelar, usa até o fim do mês que já pagou.`,
  ],
  [
    'Funciona com mais de um barbeiro?',
    'Sim. Cada um tem o próprio horário e a própria comissão, e o cliente pode escolher com quem quer cortar.',
  ],
]

function Faq() {
  return (
    <section className={SECAO}>
      <div className={CAIXA}>
        <Reveal>
          <h2 className={TITULO}>Perguntas que todo dono faz</h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-14">
          <FaqAccordion itens={PERGUNTAS.map(([pergunta, resposta]) => ({ pergunta, resposta }))} />
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Fecho() {
  return (
    <section className="relative overflow-hidden px-6 py-[120px] text-center lg:py-[170px]">
      <div
        className="glow left-1/2 top-1/2 h-[680px] w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{ '--glow-tint': 'rgba(224,138,60,0.16)' } as React.CSSProperties}
      />
      <div className={CAIXA}>
        <Reveal>
          <h2 className="landing-display mx-auto max-w-[17ch] text-[clamp(2.4rem,6vw,4.6rem)] text-[var(--l-fg)]">
            Quantos cortes você perdeu esse mês sem saber?
          </h2>
        </Reveal>
        <Reveal delay={0.09}>
          <p className="mx-auto mt-8 max-w-[42ch] text-[17px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[19px]">
            Em {DIAS_DE_TESTE} dias dá tempo de ver o lembrete evitando uma falta.
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

function Rodape() {
  return (
    <footer className="relative z-[1] px-6 pb-16">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--l-line)] pt-10">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--l-fg-mute)]">
          <Scissors size={14} strokeWidth={1.9} className="text-[var(--l-accent)]" />
          Club Cut
        </span>
        {[
          ['/termos', 'Termos de uso'],
          ['/privacidade', 'Privacidade'],
          ['/login', 'Entrar'],
        ].map(([href, rotulo]) => (
          <Link
            key={href}
            to={href}
            className="text-[14px] text-[var(--l-fg-faint)] transition-colors duration-200 hover:text-[var(--l-fg)]"
          >
            {rotulo}
          </Link>
        ))}
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

export function VendasPage() {
  return (
    <div className="landing min-h-[100dvh]">
      {/* Grão por cima de tudo, sem capturar clique. Tira o chapado do fundo. */}
      <div className="landing-grain" aria-hidden="true" />

      <Navbar />
      <main>
        <Hero />
        <Dor />
        <Recursos />
        <PorDentro />
        <Numeros />
        <Depoimentos />
        <ComoComeca />
        <Preco />
        <Faq />
        <Fecho />
      </main>
      <Rodape />

      {/* Aparece depois do herói e se apaga perto de qualquer CTA de seção. */}
      <CtaFixo rotulo={CTA} microcopy={MICROCOPY} />
    </div>
  )
}
