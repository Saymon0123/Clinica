import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react'

/**
 * Peças de movimento da página de vendas.
 *
 * Todas partem do mesmo princípio: `prefers-reduced-motion` não recebe uma
 * versão degradada da animação, recebe o estado final direto. Meia animação é
 * pior que nenhuma para quem pediu para não ter animação.
 */

/** Curva de saída. A mesma do resto do produto, para o movimento ter uma assinatura só. */
const SAIDA = [0.23, 1, 0.32, 1] as const

/**
 * `Link` do Router com as props de movimento.
 *
 * Criado uma vez, fora de qualquer componente: `motion.create` dentro do render
 * devolveria um tipo novo a cada passagem e o React desmontaria e remontaria o
 * link inteiro, perdendo o foco e cortando a animação no meio.
 */
const LinkAnimado = motion.create(Link)

/**
 * Entrada por scroll.
 *
 * `once` é deliberado: reanimar a cada passagem transforma a página num
 * piscapisca quando a pessoa rola para cima para reler alguma coisa.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const semMovimento = useReducedMotion()

  if (semMovimento) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay, ease: SAIDA }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Entrada em cascata: os filhos entram em sequência, não em bloco.
 *
 * O pai e os filhos precisam estar na mesma árvore de variants para o
 * `staggerChildren` funcionar, e é por isso que isto é um par de componentes
 * em vez de uma prop solta.
 */
export function RevealGrupo({
  children,
  className = '',
  intervalo = 0.075,
}: {
  children: ReactNode
  className?: string
  intervalo?: number
}) {
  const semMovimento = useReducedMotion()

  if (semMovimento) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="oculto"
      whileInView="visivel"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ visivel: { transition: { staggerChildren: intervalo } } }}
    >
      {children}
    </motion.div>
  )
}

export function RevealItem({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const semMovimento = useReducedMotion()

  if (semMovimento) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      variants={{
        oculto: { opacity: 0, y: 20 },
        visivel: { opacity: 1, y: 0, transition: { duration: 0.58, ease: SAIDA } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Botão que se desloca na direção do cursor.
 *
 * O deslocamento vive em motion values, fora do ciclo de render do React: com
 * `useState` a árvore inteira re-renderizaria a cada movimento do mouse e o
 * efeito engasgaria justamente no gesto que deveria parecer líquido.
 *
 * Ativo só em ponteiro fino. No toque não existe hover, e o "hover" que o
 * navegador simula no tap deixaria o botão deslocado depois que o dedo sai.
 */
export function BotaoMagnetico({
  to,
  children,
  variante = 'destaque',
  className = '',
}: {
  to: string
  children: ReactNode
  variante?: 'destaque' | 'discreto'
  className?: string
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const semMovimento = useReducedMotion()

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mx = useSpring(x, { stiffness: 260, damping: 22, mass: 0.4 })
  const my = useSpring(y, { stiffness: 260, damping: 22, mass: 0.4 })

  const destaque = variante === 'destaque'
  const base =
    'relative inline-flex items-center justify-center min-h-[52px] rounded-full px-8 text-[15px] font-semibold transition-shadow duration-300'
  const cor = destaque
    ? 'bg-[var(--l-accent)] text-[var(--l-on-accent)] hover:shadow-[0_0_44px_-6px_rgba(224,138,60,0.65)]'
    : 'border border-[var(--l-line-strong)] text-[var(--l-fg)] hover:border-[var(--l-accent)]'

  function seguirCursor(e: React.MouseEvent) {
    if (semMovimento || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    // Fração do centro, limitada: sem o teto o botão descola do lugar e o
    // cursor passa a apontar para fora dele.
    x.set(((e.clientX - (r.left + r.width / 2)) / r.width) * 16)
    y.set(((e.clientY - (r.top + r.height / 2)) / r.height) * 12)
  }

  function soltar() {
    x.set(0)
    y.set(0)
  }

  return (
    <LinkAnimado
      ref={ref}
      to={to}
      onMouseMove={seguirCursor}
      onMouseLeave={soltar}
      style={{ x: mx, y: my }}
      whileTap={semMovimento ? undefined : { scale: 0.97 }}
      className={`${base} ${cor} ${className}`}
    >
      {children}
    </LinkAnimado>
  )
}

/** Versão sem física, para onde um link simples basta. */
export function BotaoSimples({
  to,
  children,
  className = '',
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-[52px] items-center justify-center rounded-full bg-[var(--l-accent)] px-8 text-[15px] font-semibold text-[var(--l-on-accent)] transition-shadow duration-300 hover:shadow-[0_0_44px_-6px_rgba(224,138,60,0.65)] ${className}`}
    >
      {children}
    </Link>
  )
}

/**
 * Número que conta de zero ao valor quando entra na tela.
 *
 * A contagem escreve direto no nó de texto em vez de passar por estado do
 * React: são ~60 atualizações por segundo, e cada uma virando render faria a
 * seção inteira reconciliar à toa.
 */
export function Contador({
  ate,
  sufixo = '',
  duracao = 1.4,
}: {
  ate: number
  sufixo?: string
  duracao?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.5 })
  const semMovimento = useReducedMotion()

  useEffect(() => {
    const no = ref.current
    if (!no) return

    if (semMovimento || !naTela) {
      if (semMovimento) no.textContent = `${ate}${sufixo}`
      return
    }

    const controle = animate(0, ate, {
      duration: duracao,
      ease: SAIDA,
      onUpdate: (v) => {
        no.textContent = `${Math.round(v)}${sufixo}`
      },
    })
    return () => controle.stop()
  }, [naTela, ate, sufixo, duracao, semMovimento])

  return <span ref={ref}>0{sufixo}</span>
}

