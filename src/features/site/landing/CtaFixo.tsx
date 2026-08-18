import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

/**
 * Barra de ação que acompanha o scroll.
 *
 * Existe para tirar a pergunta "onde eu clico agora" de quem já se convenceu no
 * meio da página e não quer procurar o botão.
 *
 * **Ela some quando um CTA de seção está na tela.** Duas chamadas para a mesma
 * ação visíveis ao mesmo tempo não somam: dividem a atenção e fazem a pessoa
 * escolher entre botões em vez de escolher o produto. Some também antes de o
 * herói sair, onde o botão grande já está à vista.
 *
 * A observação é por atributo (`data-cta-inline`) e não por prop: assim uma
 * seção nova ganha o comportamento só marcando o botão, sem ter que avisar
 * este componente que ela existe.
 */
export function CtaFixo({ rotulo, microcopy }: { rotulo: string; microcopy: string }) {
  const [visivel, setVisivel] = useState(false)
  const semMovimento = useReducedMotion()

  useEffect(() => {
    const alvos = Array.from(document.querySelectorAll('[data-cta-inline]'))
    const naTela = new Set<Element>()

    function decidir() {
      // Passou do herói (uma tela) e nenhum CTA de seção à vista.
      setVisivel(window.scrollY > window.innerHeight * 0.9 && naTela.size === 0)
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) naTela.add(e.target)
          else naTela.delete(e.target)
        }
        decidir()
      },
      // Margem generosa: o CTA fixo tem de sumir ANTES de o botão da seção
      // encostar na borda, senão os dois aparecem juntos por um instante.
      { rootMargin: '-80px 0px -80px 0px' },
    )

    alvos.forEach((a) => observador.observe(a))
    window.addEventListener('scroll', decidir, { passive: true })
    decidir()

    return () => {
      observador.disconnect()
      window.removeEventListener('scroll', decidir)
    }
  }, [])

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
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
            <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-[var(--l-line)] bg-[rgba(255,255,255,0.94)] p-3 shadow-[0_16px_44px_-18px_rgba(14,15,12,0.35)] backdrop-blur-xl sm:w-auto sm:flex-row sm:items-center sm:gap-4 sm:rounded-full sm:py-2 sm:pl-6 sm:pr-2">
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
