import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/**
 * FAQ em sanfona.
 *
 * Base: "Interactive Accordion" de @jatin-yadav05, do catálogo 21st.dev.
 * Adaptado: `framer-motion` virou `motion/react`, as classes semânticas do
 * shadcn viraram os tokens da landing, e foram acrescentados o suporte a
 * `prefers-reduced-motion` e a ligação de acessibilidade entre o botão e o
 * painel, que o original não tinha.
 *
 * Uma pergunta aberta por vez. Cinco respostas abertas ao mesmo tempo eram uma
 * parede de texto que a pessoa pulava inteira; fechadas, ela lê só a dúvida que
 * é dela.
 */
type Pergunta = { pergunta: string; resposta: string }

const MOLA = { type: 'spring', stiffness: 300, damping: 30 } as const

export function FaqAccordion({ itens }: { itens: Pergunta[] }) {
  // Começa fechado: a lista de perguntas é o conteúdo, e uma delas já aberta
  // empurraria as outras para fora da vista.
  const [aberta, setAberta] = useState<number | null>(null)
  const [sobre, setSobre] = useState<number | null>(null)
  const semMovimento = useReducedMotion()
  const base = useId()

  return (
    <div className="flex flex-col">
      {itens.map((item, i) => {
        const ativa = aberta === i
        const emFoco = sobre === i
        const idBotao = `${base}-b-${i}`
        const idPainel = `${base}-p-${i}`

        return (
          <div key={item.pergunta} className="border-t border-[var(--l-line)]">
            {/* Todo o resto desta peça já responde ao mouse com mola — só
                faltava o toque. No celular, onde o hover nunca dispara, abrir
                uma pergunta não dava resposta nenhuma sob o dedo. */}
            <motion.button
              id={idBotao}
              type="button"
              aria-expanded={ativa}
              aria-controls={idPainel}
              onClick={() => setAberta(ativa ? null : i)}
              onMouseEnter={() => setSobre(i)}
              onMouseLeave={() => setSobre(null)}
              whileTap={semMovimento ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className="group relative w-full cursor-pointer text-left"
            >
              <div className="flex items-center gap-5 py-7 sm:gap-7">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                  <motion.span
                    className="absolute inset-0 rounded-full bg-[var(--l-accent)]"
                    initial={false}
                    animate={{
                      scale: ativa ? 1 : emFoco ? 0.85 : 0.6,
                      opacity: ativa ? 1 : emFoco ? 0.16 : 0,
                    }}
                    transition={semMovimento ? { duration: 0 } : MOLA}
                  />
                  <motion.span
                    className="landing-num relative z-[1] text-[13px]"
                    animate={{ color: ativa ? 'var(--l-on-accent)' : 'var(--l-fg-faint)' }}
                    transition={{ duration: semMovimento ? 0 : 0.2 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </motion.span>
                </span>

                <motion.h3
                  className="flex-1 text-[17px] font-semibold tracking-[-0.015em] sm:text-[19px]"
                  animate={{
                    x: semMovimento ? 0 : ativa || emFoco ? 4 : 0,
                    color: ativa || emFoco ? 'var(--l-fg)' : 'var(--l-fg-mute)',
                  }}
                  transition={semMovimento ? { duration: 0 } : { ...MOLA, stiffness: 400 }}
                >
                  {item.pergunta}
                </motion.h3>

                {/* Mais que vira x. Roda em transform, e o traço vertical some
                    em vez de o ícone inteiro trocar de desenho. */}
                <motion.span
                  aria-hidden="true"
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-[var(--l-fg)]"
                  animate={{ rotate: semMovimento ? 0 : ativa ? 45 : 0, opacity: ativa || emFoco ? 1 : 0.45 }}
                  transition={semMovimento ? { duration: 0 } : MOLA}
                >
                  {/* Decorativa: o estado aberto/fechado ja e anunciado pelo
                      `aria-expanded` do botao. Sem aria-hidden o leitor de tela
                      anuncia um grafico sem nome depois de cada pergunta. */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 1V15M1 8H15"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.span>
              </div>

              {/* Fio que corre sob a pergunta enquanto o cursor está nela. */}
              <motion.span
                className="absolute bottom-0 left-0 h-px w-full origin-left bg-[var(--l-accent)]"
                initial={false}
                animate={{ scaleX: ativa ? 1 : emFoco ? 0.28 : 0 }}
                transition={semMovimento ? { duration: 0 } : MOLA}
              />
            </motion.button>

            <AnimatePresence initial={false}>
              {ativa && (
                <motion.div
                  id={idPainel}
                  role="region"
                  aria-labelledby={idBotao}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: semMovimento
                      ? { duration: 0 }
                      : { height: MOLA, opacity: { duration: 0.2, delay: 0.08 } },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: semMovimento
                      ? { duration: 0 }
                      : { height: MOLA, opacity: { duration: 0.1 } },
                  }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[62ch] pb-8 pl-[60px] pr-4 text-[15px] leading-relaxed text-[var(--l-fg-mute)] sm:pl-[68px]">
                    {item.resposta}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
