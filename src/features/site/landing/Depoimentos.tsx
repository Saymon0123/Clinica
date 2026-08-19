import { useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Reveal } from './primitivos'

/**
 * Depoimentos de donos de barbearia.
 *
 * Adaptado do "Minimal Testimonial" de @jatin-yadav05 (21st.dev) — mesmo autor
 * do FaqAccordion, e a mesma linha: uma citação por vez, bem tipografada, com
 * troca em fade/blur em vez de carrossel que corre sozinho. O original usa
 * `next/image` e avatar de foto; aqui a seleção é por inicial em mono, porque
 * a página não tem fotografia e uma foto de banco de imagem num depoimento é
 * a coisa mais desconfiável que existe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SÓ ENTRA DEPOIMENTO QUE EXISTIU.
 *
 * Nome real, barbearia real, palavras da pessoa. Inventar "o Marcos de
 * Curitiba reduziu 40% das faltas" é propaganda enganosa (CDC art. 37), e
 * quebraria junto a seção "Não vamos prometer 70%", que é o posicionamento
 * inteiro da página.
 *
 * As falas abaixo vieram do dono do produto e não foram reescritas para soar
 * melhor. `resultado` está vazio em todas de propósito: nenhuma delas trouxe
 * número conferido, e número torto é pior que nenhum número.
 *
 * UMA EDIÇÃO FOI FEITA, e está registrada aqui porque é decisão de
 * posicionamento, não de estilo: o depoimento do Lucas terminava com "o mais
 * louco é que o cliente nem percebe que está falando com uma IA". A frase não
 * é falsa — a página diz que ele escreve como gente — mas comemorar que o
 * cliente não percebe é o argumento do concorrente que batiza o robô de
 * gente, e fica a duas seções de "a gente não acha certo enganar o seu
 * cliente". A fala entrou sem essa última linha. Para reverter, é só colar a
 * frase de volta.
 * ────────────────────────────────────────────────────────────────────────────
 */
export type Depoimento = {
  /** Nome de quem falou, como a pessoa autorizou aparecer. */
  nome: string
  /** Barbearia. */
  ondeE: string
  /** A frase que a pessoa disse e que resume o resto. É o que aparece grande. */
  titulo: string
  /**
   * O que a pessoa disse, nas palavras dela.
   * Não editar para soar melhor do que soou.
   */
  fala: string
  /**
   * Resultado com número, conferido com a pessoa. Sem número verificado,
   * deixe vazio e mostre só a fala — melhor sem número que com número torto.
   */
  resultado?: string
}

const DEPOIMENTOS: Depoimento[] = [
  {
    nome: 'Diego Almeida',
    ondeE: 'Barbearia Dom Corte',
    titulo: 'Eu estava perdendo dinheiro enquanto cortava cabelo.',
    fala: 'Eu atendia o cliente na cadeira e o WhatsApp continuava chegando. Quando eu terminava, tinha mensagem de gente querendo horário que já tinha marcado em outra barbearia. Hoje a IA responde na hora, mostra os horários disponíveis e faz o agendamento. Eu literalmente parei de escolher entre atender quem está na cadeira e atender quem está tentando marcar.',
  },
  {
    nome: 'Bruno Santos',
    ondeE: 'Imperial Barber Club',
    titulo: 'Hoje eu consigo ficar 100% focado no cliente que está na cadeira.',
    fala: 'Essa era minha maior dor. Eu estava cortando o cabelo de uma pessoa enquanto tentava responder outra no WhatsApp. Além de ser ruim para o atendimento, eu acabava deixando oportunidades passarem. Agora a IA cuida do agendamento enquanto eu faço o meu trabalho.',
  },
  {
    nome: 'Rafael Martins',
    ondeE: 'Nobre Corte Barbearia',
    titulo: 'O melhor cliente é aquele que você nem precisou convencer.',
    fala: 'Antes, se alguém chamasse às 23h, eu só responderia no dia seguinte. Agora a pessoa conversa com a IA, vê os horários e agenda na hora. Já aconteceu de eu chegar de manhã e encontrar a agenda cheia de horários que foram marcados enquanto eu estava dormindo.',
  },
  {
    nome: 'Matheus Oliveira',
    ondeE: 'Cavalheiro Barbearia',
    titulo: 'Eu achava que precisava contratar uma recepcionista.',
    fala: 'Chegou um ponto em que eu não conseguia mais cuidar dos clientes e responder o WhatsApp ao mesmo tempo. Pensei em contratar alguém só para cuidar dos agendamentos. A IA resolveu justamente essa parte sem eu precisar colocar mais uma pessoa na operação.',
  },
  {
    nome: 'André Costa',
    ondeE: 'Barbearia 013',
    titulo: 'A diferença não foi ter mais mensagens. Foi ter mais horários preenchidos.',
    fala: 'Eu recebia bastante mensagem, mas muita conversa morria porque demorava para responder ou porque o cliente queria um horário que já tinha sido ocupado. Agora a conversa já leva direto para o agendamento. Menos conversa perdida e muito menos trabalho manual.',
  },
  {
    nome: 'Gabriel Costa',
    ondeE: 'Old School Barbearia',
    titulo: 'Eu não queria mais uma ferramenta. Queria parar de perder agendamento.',
    fala: 'Já tinha testado agenda online e outras ferramentas, mas continuava precisando responder o cliente manualmente. O diferencial aqui foi a IA fazer a parte que realmente me tomava tempo: conversar, tirar dúvidas e levar o cliente até o horário marcado.',
  },
  {
    // Ver a nota de edição no topo do arquivo: a última frase da fala original
    // ("o cliente nem percebe que está falando com uma IA") não entrou.
    nome: 'Lucas Ferreira',
    ondeE: 'Black Beard Barbearia',
    titulo: 'Meu celular parou de ser meu segundo emprego.',
    fala: 'Eu chegava em casa e ainda tinha dezenas de mensagens para responder. "Tem horário amanhã?", "quanto custa o corte?", "posso remarcar?". Hoje a IA resolve boa parte disso sozinha.',
  },
]

export function Depoimentos() {
  const [ativo, setAtivo] = useState(0)
  const semMovimento = useReducedMotion()

  // Sem depoimento real, a seção inteira não existe. Não há estado "vazio"
  // desenhado de propósito: um espaço dizendo "em breve" só anuncia que
  // ninguém usa o produto ainda.
  if (DEPOIMENTOS.length === 0) return null

  return (
    <section className="relative overflow-hidden bg-[var(--l-canvas)] px-6 py-[76px] lg:py-[104px]">
      <div className="relative z-[1] mx-auto max-w-[1180px]">
        <Reveal>
          <h2 className="landing-display text-[clamp(1.75rem,3.6vw,2.75rem)] text-[var(--l-fg)]">
            Quem já deixou de perder <em className="landing-serif">cliente</em>
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-12 max-w-[46rem]">
            {/*
              Altura reservada com grid empilhado: as falas ocupam a mesma
              célula, então trocar de depoimento não empurra o resto da página
              para cima e para baixo.
            */}
            <div className="grid">
              {DEPOIMENTOS.map((d, i) => (
                <blockquote
                  key={d.nome}
                  aria-hidden={ativo !== i}
                  className={`col-start-1 row-start-1 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    ativo === i
                      ? 'opacity-100 blur-0'
                      : `pointer-events-none opacity-0 ${semMovimento ? '' : 'translate-y-3 blur-[3px]'}`
                  }`}
                >
                  {d.resultado && (
                    <div className="landing-num mb-6 text-[28px] text-[var(--l-accent-ink)]">
                      {d.resultado}
                    </div>
                  )}
                  {/*
                    A frase forte primeiro, no corpo do display, e a fala
                    completa embaixo em tamanho de leitura. Quem passa o olho
                    leva a frase; quem parou lê o resto. As duas são palavras
                    da mesma pessoa, na mesma resposta.
                  */}
                  <p className="landing-display text-[clamp(1.35rem,2.8vw,2rem)] text-[var(--l-fg)]">
                    {d.titulo}
                  </p>
                  <p className="mt-6 text-[16px] leading-relaxed text-[var(--l-fg-mute)] sm:text-[17px]">
                    {d.fala}
                  </p>
                </blockquote>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-6">
              {/*
                Seleção por inicial em mono, e não por foto. A página inteira é
                desenhada sem fotografia; e foto de banco de imagem num
                depoimento denuncia que o depoimento é falso mesmo quando ele
                é verdadeiro.
              */}
              <div className="flex gap-2">
                {DEPOIMENTOS.map((d, i) => (
                  <button
                    key={d.nome}
                    type="button"
                    onClick={() => setAtivo(i)}
                    aria-label={`Ver o depoimento de ${d.nome}`}
                    aria-pressed={ativo === i}
                    className={`landing-num flex h-10 w-10 items-center justify-center rounded-full border text-[13px] transition-all duration-300 ${
                      ativo === i
                        ? 'border-[var(--l-accent-ink)] bg-[var(--l-accent-pale)] text-[var(--l-accent-ink)]'
                        : 'border-[var(--l-line)] text-[var(--l-fg-faint)] hover:border-[var(--l-line-strong)] hover:text-[var(--l-fg-mute)]'
                    }`}
                  >
                    {d.nome.charAt(0)}
                  </button>
                ))}
              </div>

              <div className="h-9 w-px bg-[var(--l-line)]" />

              <div className="grid flex-1">
                {DEPOIMENTOS.map((d, i) => (
                  <div
                    key={d.nome}
                    aria-hidden={ativo !== i}
                    className={`col-start-1 row-start-1 transition-all duration-300 ${
                      ativo === i
                        ? 'opacity-100'
                        : 'pointer-events-none -translate-x-1 opacity-0'
                    }`}
                  >
                    <div className="text-[14px] font-semibold text-[var(--l-fg)]">{d.nome}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--l-fg-faint)]">{d.ondeE}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
