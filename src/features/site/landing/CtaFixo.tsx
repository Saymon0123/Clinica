import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useCtaInlineVisivel } from './useCtaInlineVisivel'

/**
 * Barra de ação que acompanha o scroll.
 *
 * Existe para tirar a pergunta "onde eu clico agora" de quem já se convenceu no
 * meio da página e não quer procurar o botão.
 *
 * **Ela some quando um CTA de seção (ou o rodapé) está na tela.** Duas
 * chamadas para a mesma ação visíveis ao mesmo tempo não somam: dividem a
 * atenção e fazem a pessoa escolher entre botões em vez de escolher o
 * produto. Some também antes de o herói sair, onde o botão grande já está à
 * vista. A detecção mora em `useCtaInlineVisivel`, compartilhada com o popup
 * do WhatsApp — ver o porquê lá.
 */
export function CtaFixo({ rotulo, microcopy }: { rotulo: string; microcopy: string }) {
  const algumCtaVisivel = useCtaInlineVisivel()
  const [rolouDoHeroi, setRolouDoHeroi] = useState(false)
  const visivel = rolouDoHeroi && !algumCtaVisivel
  const semMovimento = useReducedMotion()
  const barraRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Passou do herói (uma tela). Complementa `algumCtaVisivel`: aquele diz
    // se algo já pede para a barra sumir; este diz se ela já tem motivo para
    // existir.
    function decidir() {
      setRolouDoHeroi(window.scrollY > window.innerHeight * 0.9)
    }
    window.addEventListener('scroll', decidir, { passive: true })
    decidir()
    return () => window.removeEventListener('scroll', decidir)
  }, [])

  /*
    Publica a própria altura como variável CSS. Outro elemento fixo no
    canto inferior (o popup do WhatsApp) lê essa variável para empurrar a
    própria posição para cima quando esta barra está na tela — em vez de os
    dois adivinharem a altura um do outro com números fixos, que quebram no
    primeiro texto de microcopy mais longo.
  */
  useEffect(() => {
    if (!visivel) {
      document.documentElement.style.setProperty('--cta-fixo-h', '0px')
      return
    }
    const el = barraRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--cta-fixo-h', `${el.offsetHeight}px`)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.setProperty('--cta-fixo-h', '0px')
    }
  }, [visivel])

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          ref={barraRef}
          initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex max-w-[1180px] justify-center sm:justify-end">
            {/*
              Empilha no celular e vira pílula só a partir de `sm`.

              Em linha única a 390px, a microcopy quebrava em três linhas e
              transbordava a pílula, passando por cima do conteúdo atrás. Texto
              e botão lado a lado não cabem nessa largura, e a microcopy não sai
              daqui: é ela que responde "vou ter que passar cartão?" no momento
              em que a pessoa cogita clicar.
            */}
            <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-[var(--l-line)] bg-[rgba(22,32,27,0.92)] p-3 shadow-[0_16px_44px_-18px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:w-auto sm:flex-row sm:items-center sm:gap-4 sm:rounded-full sm:py-2 sm:pl-6 sm:pr-2">
              <span className="text-center text-[13px] leading-tight text-[var(--l-fg-mute)] sm:text-left">
                {microcopy}
              </span>
              <Link
                to="/criar-conta"
                className="inline-flex min-h-[46px] w-full shrink-0 items-center justify-center rounded-full bg-[var(--l-accent)] px-6 text-[14px] font-semibold text-[var(--l-on-accent)] transition-[transform,box-shadow] duration-200 hover:bg-[var(--l-accent-deep)] active:scale-[0.97] sm:w-auto"
              >
                {rotulo}
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
