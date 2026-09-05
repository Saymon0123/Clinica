import { moedaComCentavos } from './Calculadora'
import { precoPorAgendamento } from '../../../lib/planos'

/**
 * O argumento do comparativo, em uma imagem.
 *
 * A seção inteira existe para dizer uma coisa: no sistema por mensalidade o
 * preço SOBE a cada barbeiro contratado, e aqui ele quase não se mexe. Isso
 * é uma forma, não um parágrafo — e a tabela abaixo levava 199 palavras para
 * dizer o que duas linhas dizem em um segundo. (Varredura de 05/09: a página
 * tem 1.949 palavras e uma imagem só.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE ONDE VEM CADA NÚMERO — nenhum é estimado.
 *
 * - A linha da mensalidade é a escada pública do AppBarber, a mesma que a
 *   tabela cita e que foi reconferida em 02/09: R$ 79,90 (1 profissional),
 *   109,90 (2), 164,50 (3) e 219,90 (a partir de 4). Para em 4 de propósito:
 *   a fonte não publica preço acima disso, e inventar a continuação da curva
 *   seria o "até 70%" que esta página recusa.
 *
 * - A linha do Club Cut é calculada, não digitada: `precoPorAgendamento()`
 *   lê as faixas de `planos.ts`, que são cópia da migration 0097. Se a faixa
 *   mudar no banco, o gráfico muda junto.
 *
 * - O VOLUME é a única suposição, e por isso está escrita na tela: 40
 *   horários confirmados por barbeiro no mês. Não é número inventado para o
 *   gráfico — é exatamente a razão que a tabela já usava no exemplo dos 3
 *   barbeiros com 120 agendamentos.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * **Por que não animar o traço.** A linha da mensalidade é tracejada (é o
 * segundo canal de identidade, além da cor), e animar `stroke-dashoffset`
 * numa linha que já usa `stroke-dasharray` briga com o próprio tracejado. O
 * `Reveal` da seção já dá a entrada; o gráfico não precisa de outra.
 *
 * **Sobre a paleta.** As duas cores são as da página (o verde do acento e o
 * cinza apagado). O validador de paletas reprova as duas por croma baixo —
 * elas são discretas de propósito — mas aprova o que decide a leitura:
 * separação entre as séries de ΔE 16,4 em visão normal e 13,8 em deuteranopia
 * (o alvo é 8), e contraste acima de 3:1 contra a superfície. Além da cor,
 * cada série carrega traço próprio (cheio x tracejado) e rótulo direto, então
 * ninguém depende de distinguir verde de cinza para entender.
 */

/** Horários confirmados por barbeiro, por mês. A única suposição do gráfico. */
const POR_BARBEIRO = 40

/**
 * Preços públicos do sistema por mensalidade, por número de profissionais.
 * Índice = quantidade de barbeiros. Ver a nota de fontes no topo.
 */
const MENSALIDADE: Record<number, number> = { 1: 79.9, 2: 109.9, 3: 164.5, 4: 219.9 }

const EQUIPES = [1, 2, 3, 4] as const

/* Geometria do desenho. O viewBox é fixo e o SVG escala com a largura. */
const L = 58 // margem esquerda, para caber "R$ 240" no topo do eixo
const R = 92 // margem direita, para o rótulo no fim de cada linha
const TOPO = 26
const BASE = 176
const LARGURA = 640
const TETO = 240 // R$ do topo do eixo

const x = (i: number) => L + (i * (LARGURA - L - R)) / (EQUIPES.length - 1)
const y = (v: number) => BASE - (v / TETO) * (BASE - TOPO)

const pontos = (valor: (n: number) => number) =>
  EQUIPES.map((n, i) => `${x(i)},${y(valor(n))}`).join(' ')

const nossoMes = (n: number) => n * POR_BARBEIRO * precoPorAgendamento(n)
const delesMes = (n: number) => MENSALIDADE[n]

export function GraficoPreco() {
  return (
    /*
      A largura máxima não é estética: o viewBox tem 640 de largura e o SVG
      escala junto com o contêiner, então num container de 1180px todo texto
      do desenho sai 1,8x maior do que o resto da página. Limitando aqui, a
      escala fica perto de 1 e os rótulos ficam do tamanho que deveriam.
    */
    <figure className="m-0 max-w-[760px]">
      {/*
        Legenda antes do desenho: com duas séries ela é obrigatória, e vir
        antes evita que a pessoa leia o gráfico inteiro sem saber o que é o
        quê. O traço ao lado do nome repete a forma da linha — é o segundo
        canal, para quem não separa as duas cores.
      */}
      <figcaption className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2.5 text-[13.5px] text-[var(--l-fg-mute)]">
          <svg width="26" height="8" aria-hidden="true" className="shrink-0">
            <line
              x1="0"
              y1="4"
              x2="26"
              y2="4"
              stroke="var(--l-fg-faint)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          Sistema por mensalidade
        </span>
        <span className="flex items-center gap-2.5 text-[13.5px] text-[var(--l-fg)]">
          <svg width="26" height="8" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="4" x2="26" y2="4" stroke="var(--l-accent-ink)" strokeWidth="2" />
          </svg>
          Club Cut
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${LARGURA} 210`}
        className="block h-auto w-full"
        role="img"
        aria-label={
          `Custo mensal conforme a equipe cresce, com ${POR_BARBEIRO} horários confirmados por barbeiro. ` +
          EQUIPES.map(
            (n) =>
              `${n} ${n === 1 ? 'barbeiro' : 'barbeiros'}: mensalidade ${moedaComCentavos(delesMes(n))}, Club Cut ${moedaComCentavos(nossoMes(n))}.`,
          ).join(' ')
        }
      >
        {/* Grade recessiva: três linhas, só para dar escala ao olho. */}
        {[0, 120, 240].map((v) => (
          <g key={v}>
            <line
              x1={L}
              y1={y(v)}
              x2={LARGURA - R + 8}
              y2={y(v)}
              stroke="var(--l-line)"
              strokeWidth="1"
            />
            <text
              x={L - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="landing-num"
              fontSize="11"
              fill="var(--l-fg-faint)"
            >
              {v === 0 ? '0' : v === 240 ? `R$ ${v}` : v}
            </text>
          </g>
        ))}

        {/* A mensalidade: tracejada e apagada — é o termo de comparação, não o assunto. */}
        <polyline
          points={pontos(delesMes)}
          fill="none"
          stroke="var(--l-fg-faint)"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* O nosso: cheio, no acento. */}
        <polyline
          points={pontos(nossoMes)}
          fill="none"
          stroke="var(--l-accent-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {EQUIPES.map((n, i) => (
          <g key={n}>
            {/*
              O anel na cor da superfície separa o marcador da linha por baixo
              quando os dois se cruzam de perto — sem ele o ponto some dentro
              do traço.
            */}
            <circle cx={x(i)} cy={y(delesMes(n))} r="4.5" fill="var(--l-canvas)" />
            <circle cx={x(i)} cy={y(delesMes(n))} r="4.5" fill="var(--l-fg-faint)" />
            <circle cx={x(i)} cy={y(nossoMes(n))} r="5" fill="var(--l-canvas)" />
            <circle cx={x(i)} cy={y(nossoMes(n))} r="5" fill="var(--l-accent-ink)" />
            <text
              x={x(i)}
              y={BASE + 24}
              textAnchor="middle"
              fontSize="12"
              fill="var(--l-fg-mute)"
            >
              {n === 4 ? '4 barbeiros' : n}
            </text>
          </g>
        ))}

        {/*
          Rótulo direto só na ponta de cada linha, e não em cada ponto: oito
          números soltos no desenho viram a tabela que o gráfico veio
          substituir. O valor de todos os pontos está na tabela abaixo.
        */}
        <text
          x={x(EQUIPES.length - 1) + 12}
          y={y(delesMes(4)) + 4}
          className="landing-num"
          fontSize="13"
          fill="var(--l-fg-mute)"
        >
          {moedaComCentavos(delesMes(4)).replace(',00', '')}
        </text>
        <text
          x={x(EQUIPES.length - 1) + 12}
          y={y(nossoMes(4)) + 4}
          className="landing-num"
          fontSize="13"
          fill="var(--l-accent-ink)"
        >
          {moedaComCentavos(nossoMes(4)).replace(',00', '')}
        </text>
      </svg>

      <p className="mt-4 text-[13px] leading-relaxed text-[var(--l-fg-faint)]">
        Custo no mês, com {POR_BARBEIRO} horários confirmados por barbeiro. Mensalidade: página
        pública de um dos sistemas mais conhecidos, setembro de 2026 — ela não publica preço acima
        de quatro profissionais, e a linha para onde a fonte para.
      </p>
    </figure>
  )
}
