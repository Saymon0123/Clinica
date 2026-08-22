import { useEffect, useState } from 'react'

/**
 * Diz se algum CTA de seção — ou o rodapé — está na tela.
 *
 * Extraído do `CtaFixo` porque o popup do WhatsApp precisava exatamente do
 * mesmo sinal: os dois são elementos fixos no canto inferior, e cada um com
 * seu próprio `IntersectionObserver` competindo pela mesma resposta é duas
 * fontes de verdade para uma pergunta só. Agora as duas leem daqui.
 *
 * **O rodapé conta como CTA de seção.** Ele já tem o próprio link de "testar
 * grátis" e o texto de suporte; depois dele não tem mais nada, então não faz
 * sentido nenhum elemento fixo continuar flutuando por cima para sempre.
 *
 * **A margem de baixo ficou maior que a de cima, de propósito.** Antes era
 * -80px nas duas bordas, e a barra fixa (que também tem ~90-110px de altura
 * no celular) só "via" o CTA de seção depois que ele já tinha entrado bem
 * fundo na tela — sobrava uma janela onde os dois apareciam ao mesmo tempo,
 * às vezes até sobrepostos. -140px embaixo dá a folga para a barra sumir
 * ANTES de o CTA da seção chegar perto de onde ela fica.
 */
export function useCtaInlineVisivel() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const alvos = Array.from(document.querySelectorAll('[data-cta-inline], footer'))
    const naTela = new Set<Element>()

    function decidir() {
      setVisivel(naTela.size > 0)
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) naTela.add(e.target)
          else naTela.delete(e.target)
        }
        decidir()
      },
      { rootMargin: '-80px 0px -140px 0px' },
    )

    alvos.forEach((a) => observador.observe(a))
    decidir()

    return () => observador.disconnect()
  }, [])

  return visivel
}
