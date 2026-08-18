import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  Check,
  MessageCircle,
  Scissors,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { DIAS_DE_TESTE } from '../../lib/planos'

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
 * **Estrutura visual:** bandas alternadas de preto e branco, que se chocam sem
 * transição. Preto conta a história (promessa, produto, preço, fecho), branco
 * é modo catálogo, onde a pessoa compara e tira dúvida. A troca de fundo marca
 * a troca de intenção da leitura, e é por isso que a página não tem tema claro
 * e escuro: o contraste entre as bandas É a composição.
 */
const CTA_PRIMARIO = `Testar ${DIAS_DE_TESTE} dias grátis`

/** Banda preta: os momentos em que a página afirma alguma coisa. */
function BandaEscura({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`bg-[var(--l-dark)] text-[var(--l-on-dark)] px-6 py-16 sm:py-22 ${className}`}
    >
      {children}
    </section>
  )
}

/** Banda branca: os momentos em que a página deixa a pessoa conferir. */
function BandaClara({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`bg-[var(--l-light)] text-[var(--l-ink)] px-6 py-16 sm:py-22 ${className}`}
    >
      {children}
    </section>
  )
}

/** Pílula branca sobre preto: a ação mais clara da página. */
function BotaoClaro({ children }: { children: React.ReactNode }) {
  return (
    <Link
      to="/criar-conta"
      className="inline-flex items-center justify-center min-h-12 rounded-full bg-[var(--l-light)] px-7 text-base font-semibold text-[var(--l-dark)] transition-[transform,background-color] duration-150 hover:bg-[#c9c9cd] active:scale-[0.98]"
    >
      {children}
    </Link>
  )
}

const RECURSOS = [
  {
    icone: MessageCircle,
    titulo: 'Atende no WhatsApp, sozinho',
    texto:
      'Responde preço, horário e o que a barbearia faz. Marca, remarca e cancela a qualquer hora, inclusive de madrugada e no domingo.',
  },
  {
    icone: CalendarCheck,
    titulo: 'Agenda que não deixa furo',
    texto:
      'O horário de cada barbeiro, o tempo de cada serviço, e nada marcado por cima de nada. O que o agente marca aparece na hora.',
  },
  {
    icone: Smartphone,
    titulo: 'Lembra o cliente antes',
    texto:
      'Uma hora antes ele recebe um lembrete e confirma se vem. Dez minutos antes, um "está a caminho?". Menos cadeira vazia.',
  },
  {
    icone: Wallet,
    titulo: 'O dinheiro do dia, fechado',
    texto:
      'Comanda, caixa e a comissão de cada barbeiro calculada sozinha. Você fecha o dia sabendo quanto entrou.',
  },
]

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

export function VendasPage() {
  return (
    <div className="landing min-h-[100dvh]">
      {/* Navegação: uma linha, marca à esquerda, ação à direita. */}
      <header className="bg-[var(--l-dark)] px-6">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--l-brand)] text-white">
              <Scissors size={17} />
            </span>
            <span className="text-lg font-bold tracking-tight text-[var(--l-on-dark)]">
              Club Cut
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              to="/login"
              className="text-sm font-semibold text-[var(--l-on-dark-mute)] transition-colors duration-150 hover:text-[var(--l-on-dark)]"
            >
              Entrar
            </Link>
            <span className="hidden sm:block">
              <BotaoClaro>{CTA_PRIMARIO}</BotaoClaro>
            </span>
          </div>
        </div>
      </header>

      {/* Promessa. Manchete curta de propósito: no tamanho de display do
          sistema, uma frase longa vira quatro linhas e perde o impacto. */}
      <section className="bg-[var(--l-dark)] px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
        <div className="surge mx-auto max-w-[1200px]">
          <h1 className="landing-display text-[clamp(2.75rem,9vw,6.5rem)] text-[var(--l-on-dark)]">
            Sua barbearia agenda sozinha
          </h1>
          <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-[var(--l-on-dark-mute)]">
            O cliente chama no WhatsApp, o atendimento responde e marca na agenda. Você fica
            cortando cabelo.
          </p>
          <div className="mt-9">
            <BotaoClaro>{CTA_PRIMARIO}</BotaoClaro>
          </div>
        </div>
      </section>

      {/* O problema, na língua do dono. Fundo branco: aqui ela para de ouvir a
          promessa e começa a se reconhecer. */}
      <BandaClara>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2rem,5vw,3rem)] text-[var(--l-ink)]">
            Você conhece esse dia
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-[var(--l-hairline-light)] bg-[var(--l-hairline-light)] sm:grid-cols-3">
            {[
              'Está com a máquina na mão e o celular toca. Ou você para o corte, ou o cliente espera, e às vezes desiste.',
              'Marcou alguém às 15h. Às 15h20 a cadeira continua vazia, e aquele horário não volta.',
              'Alguém perguntou o preço da barba às 22h. Você respondeu no dia seguinte, e ele já tinha cortado em outro lugar.',
            ].map((t) => (
              <p key={t} className="bg-[var(--l-light)] p-8 text-base leading-relaxed text-[var(--l-mute)]">
                {t}
              </p>
            ))}
          </div>
        </div>
      </BandaClara>

      {/* O produto. Volta ao preto: é a parte que afirma. */}
      <BandaEscura>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2rem,5vw,3rem)] text-[var(--l-on-dark)]">
            O que o Club Cut faz
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {RECURSOS.map((f) => (
              <div key={f.titulo} className="rounded-[20px] bg-[var(--l-elevated)] p-8">
                <f.icone size={22} className="text-[var(--l-brand-on-dark)]" />
                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--l-on-dark)]">
                  {f.titulo}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-[var(--l-on-dark-mute)]">
                  {f.texto}
                </p>
              </div>
            ))}
          </div>
        </div>
      </BandaEscura>

      {/* Como começa. Numeração porque aqui a ordem é informação real: são
          passos que acontecem nessa sequência. */}
      <BandaClara>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2rem,5vw,3rem)] text-[var(--l-ink)]">
            Como começa
          </h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3">
            {PASSOS.map(([titulo, texto], i) => (
              <li key={titulo}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--l-brand)] text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div className="mt-5 text-xl font-semibold tracking-tight text-[var(--l-ink)]">
                  {titulo}
                </div>
                <p className="mt-2.5 text-base leading-relaxed text-[var(--l-mute)]">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </BandaClara>

      {/* Preço. O plano recomendado é o único bloco de terracota da página:
          é o carimbo, e ele só significa destaque porque não se repete. */}
      <BandaEscura>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2rem,5vw,3rem)] text-[var(--l-on-dark)]">
            Quanto custa
          </h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-[var(--l-on-dark-mute)]">
            Uma cadeira vazia por semana já custa mais que isso.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[20px] bg-[var(--l-elevated)] p-8">
              <div className="text-2xl font-semibold tracking-tight text-[var(--l-on-dark)]">
                Básico
              </div>
              <div className="mt-3 text-5xl font-bold tracking-tight text-[var(--l-on-dark)]">
                R$ 197
                <span className="text-lg font-normal text-[var(--l-on-dark-mute)]">/mês</span>
              </div>
              <ul className="mt-7 space-y-3 text-base text-[var(--l-on-dark-mute)]">
                {[
                  'Atendimento automático no WhatsApp',
                  'Agenda e clientes',
                  'Financeiro e comissão',
                  'Catálogo de serviços',
                ].map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <Check size={18} className="mt-0.5 shrink-0 text-[var(--l-brand-on-dark)]" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>

            {/* Texto em branco puro sobre o terracota: qualquer tom mais suave
                cai abaixo do contraste mínimo de leitura nesse fundo. */}
            <div className="relative rounded-[20px] bg-[var(--l-brand)] p-8 text-white">
              <span className="absolute right-8 top-8 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                Mais escolhido
              </span>
              <div className="text-2xl font-semibold tracking-tight">Pro</div>
              <div className="mt-3 text-5xl font-bold tracking-tight">
                R$ 299<span className="text-lg font-normal">/mês</span>
              </div>
              <ul className="mt-7 space-y-3 text-base">
                <li className="flex gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0" />
                  Tudo do Básico
                </li>
                <li className="flex gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Lembrete 1h antes</strong>, perguntando se o cliente confirma
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Confirmação 10 min antes</strong>, para você saber do atraso antes da
                    cadeira esfriar
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10">
            <BotaoClaro>{CTA_PRIMARIO}</BotaoClaro>
            <p className="mt-5 text-sm text-[var(--l-on-dark-mute)]">
              Sem cartão. No teste você usa o Pro completo e cancela quando quiser, sem multa.
            </p>
          </div>
        </div>
      </BandaEscura>

      {/* Dúvidas. Modo catálogo de novo: é onde ela confere antes de decidir. */}
      <BandaClara>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2rem,5vw,3rem)] text-[var(--l-ink)]">
            Perguntas que todo dono faz
          </h2>
          <div className="mt-10 grid gap-x-16 gap-y-10 sm:grid-cols-2">
            {PERGUNTAS.map(([p, r]) => (
              <div key={p}>
                <div className="text-xl font-semibold tracking-tight text-[var(--l-ink)]">{p}</div>
                <p className="mt-2.5 text-base leading-relaxed text-[var(--l-mute)]">{r}</p>
              </div>
            ))}
          </div>
        </div>
      </BandaClara>

      {/* Fecho. */}
      <BandaEscura>
        <div className="reveal mx-auto max-w-[1200px]">
          <h2 className="landing-display text-[clamp(2.25rem,6vw,4.5rem)] max-w-[18ch] text-[var(--l-on-dark)]">
            Experimente com a sua agenda de verdade
          </h2>
          <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-[var(--l-on-dark-mute)]">
            Em {DIAS_DE_TESTE} dias dá tempo de ver o lembrete evitando uma falta.
          </p>
          <div className="mt-9">
            <BotaoClaro>{CTA_PRIMARIO}</BotaoClaro>
          </div>
        </div>
      </BandaEscura>

      <footer className="bg-[var(--l-dark)] px-6 py-14">
        <div className="mx-auto max-w-[1200px] border-t border-[var(--l-hairline-dark)] pt-10">
          <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-[var(--l-on-dark-mute)]">
            <Link to="/termos" className="transition-colors duration-150 hover:text-[var(--l-on-dark)]">
              Termos de uso
            </Link>
            <Link
              to="/privacidade"
              className="transition-colors duration-150 hover:text-[var(--l-on-dark)]"
            >
              Privacidade
            </Link>
            <Link to="/login" className="transition-colors duration-150 hover:text-[var(--l-on-dark)]">
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
