import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'

/**
 * Quanto falta da página, em régua.
 *
 * A página tem quase 10.000px e não dava nenhum sinal de progresso. Barra de
 * scroll comum resolveria — mas o catálogo da 21st.dev tinha uma variação em
 * forma de RÉGUA (traços de escala com um marcador correndo entre eles), e essa
 * é exatamente a peça de vocabulário de ofício que ficou pendente da pesquisa:
 * o pente da máquina é numerado de #0 a #8, e cada número sobe um oitavo de
 * polegada. É um sistema numérico que só barbeiro reconhece — e todo barbeiro
 * reconhece na hora.
 *
 * Então a régua não é enfeite emprestado: é a única peça da página que fala a
 * numeração do ofício.
 *
 * ─── Escolhas de implementação ──────────────────────────────────────────────
 *
 * O marcador anda em `scaleX` sobre a régua inteira, e não em `left` ou
 * `width`: as duas últimas recalculam layout a cada quadro de scroll, e isso
 * numa barra fixa aparece como engasgo.
 *
 * A mola (`useSpring`) existe porque `scrollYProgress` cru é áspero — ele
 * acompanha o dedo pixel a pixel, inclusive o tranco do scroll por roda.
 *
 * Sem movimento, o componente não existe: um indicador de progresso é
 * informação secundária, e quem pediu para não ter animação não precisa dele.
 */

/** Traços da escala. Nove, como os pentes #0 a #8. */
const TRACOS = 9

export function ReguaScroll() {
  const semMovimento = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const avanco = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    restDelta: 0.001,
  })

  if (semMovimento) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex h-[3px] items-stretch"
    >
      {/* Trilho: os traços da escala, quietos, em tinta quase invisível. */}
      <div className="absolute inset-0 flex justify-between px-[2px]">
        {Array.from({ length: TRACOS }).map((_, i) => (
          <span
            key={i}
            className="w-px bg-[var(--l-fg)]"
            style={{
              // O traço do meio e as pontas são mais altos, como numa régua de
              // verdade: a escala precisa de pontos de referência.
              opacity: i === 0 || i === TRACOS - 1 || i === (TRACOS - 1) / 2 ? 0.34 : 0.16,
            }}
          />
        ))}
      </div>

      {/* O marcador que corre. */}
      <motion.div
        className="h-full w-full origin-left bg-[var(--l-accent-ink)]"
        style={{ scaleX: avanco }}
      />
    </div>
  )
}
