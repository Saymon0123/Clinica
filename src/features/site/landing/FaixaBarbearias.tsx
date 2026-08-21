import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { DEPOIMENTOS } from './Depoimentos'

/**
 * Velocidade-alvo da faixa, em pixels por segundo. Ponto médio deliberado:
 * rápido o bastante para não parecer parado, devagar o bastante para dar
 * tempo de reconhecer cada logo antes dela sair da tela. Marquee de vitrine
 * costuma ficar na casa de 40–60px/s; abaixo disso lê como travado, acima
 * disso vira letreiro de promoção.
 */
const VELOCIDADE_PX_S = 46

/**
 * As barbearias que deram depoimento, em faixa.
 *
 * Inspirado no padrão de "logo marquee" da 21st.dev — a variação do
 * @ddoemonn é a única do catálogo que declara respeitar `prefers-reduced-motion`
 * e pausar no foco, e não só no hover. Escrito aqui em vez de instalado porque
 * a mecânica é de dez linhas de CSS e o que interessava era o comportamento.
 *
 * ─── Por que NOME e não logo ────────────────────────────────────────────────
 *
 * Barbearia pequena não tem logo em SVG, e a alternativa seria desenhar um por
 * ela — o que transforma prova social em ilustração nossa. Nome escrito é o que
 * a pessoa autorizou e é o que dá para verificar.
 *
 * ─── Por que aqui em cima ───────────────────────────────────────────────────
 *
 * A página não tinha prova NENHUMA acima da dobra: os sete nomes existiam, mas
 * enterrados dentro do seletor de depoimentos, um por vez, a 6.000px do topo.
 * Aqui eles viram a primeira coisa que a pessoa lê depois do herói.
 *
 * A lista vem de `DEPOIMENTOS` de propósito. Barbearia só aparece na faixa se
 * ela deu depoimento — sem lista paralela que possa divergir, e sem tentação de
 * encher a faixa com nomes que não autorizaram nada.
 *
 * ─── Só logo, nunca nome em texto misturado ─────────────────────────────────
 *
 * Nem toda barbearia tem uma logo em arquivo ainda. Em vez de misturar logo
 * com nome escrito na mesma faixa — o que lê como dois níveis de acabamento
 * diferentes lado a lado —, a faixa só mostra quem já tem logo. Quem não tem
 * continua com depoimento normal na seção de depoimentos; some daqui até a
 * logo chegar.
 */
type ItemFaixa = { chave: string; ondeE: string; logo: string }

export function FaixaBarbearias() {
  const semMovimento = useReducedMotion()
  const listaRef = useRef<HTMLUListElement>(null)

  const itens: ItemFaixa[] = DEPOIMENTOS.filter((d) => d.logo).map((d) => ({
    chave: d.ondeE,
    ondeE: d.ondeE,
    logo: d.logo as string,
  }))

  /*
    Mede a largura real de UMA cópia da lista (a outra é o espelho que fecha
    o laço) e o gap que a separa da segunda cópia, e usa a soma — não -50%
    fixo — como distância do laço. -50% da largura total só fecha sem emenda
    se o gap entre as duas cópias for idêntico ao gap médio dentro de cada
    uma, o que não é garantido; a soma medida sempre pousa a cópia 2 exatamente
    onde a cópia 1 começou. A duração converte essa mesma distância pela
    velocidade-alvo, em vez de uma duração fixa que fica errada toda vez que
    o conteúdo muda de tamanho. ResizeObserver reage também ao carregamento
    assíncrono das imagens, que muda a largura depois do primeiro paint.
  */
  useEffect(() => {
    const track = listaRef.current?.parentElement
    const lista = listaRef.current
    if (!track || !lista || semMovimento) return

    const observer = new ResizeObserver(() => {
      const largura = lista.getBoundingClientRect().width
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0
      const distancia = largura + gap
      if (distancia > 0) {
        track.style.setProperty('--faixa-distancia', `${distancia}px`)
        track.style.setProperty('--faixa-duration', `${distancia / VELOCIDADE_PX_S}s`)
      }
    })
    observer.observe(lista)
    return () => observer.disconnect()
  }, [semMovimento, itens.length])

  if (itens.length === 0) return null

  const rotulo = `${itens.length} barbearias que usam o Club Cut`

  /*
    Sem movimento, a faixa não vira uma versão devagar de si mesma: ela vira
    uma lista quieta e centralizada. Meia animação é pior que nenhuma para
    quem pediu para não ter animação.
  */
  if (semMovimento) {
    return (
      <section aria-label={rotulo} className="border-y border-[var(--l-line)] px-6 py-7">
        <ul className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-16 gap-y-8">
          {itens.map((item) => (
            <li key={item.chave}>
              <ItemLogo item={item} />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section
      aria-label={rotulo}
      className="group relative overflow-hidden border-y border-[var(--l-line)] py-7"
      style={{
        /*
          Máscara nas bordas: sem ela os nomes aparecem e somem cortados na
          régua da tela, o que denuncia o truque. Com ela, eles emergem e se
          desfazem.
        */
        maskImage:
          'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
      }}
    >
      {/*
        Duas cópias da mesma lista, deslizando por `--faixa-distancia` (a
        largura de uma cópia mais o gap que a separa da outra). No fim do
        ciclo a segunda cópia está exatamente onde a primeira começou, então
        o laço não tem emenda visível. É por isso que a duplicata existe —
        não é redundância.

        A cópia é `aria-hidden`: o leitor de tela lê a lista uma vez só.
      */}
      <div className="faixa-desliza flex w-max items-center gap-x-24 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
        {[0, 1].map((copia) => (
          <ul
            key={copia}
            ref={copia === 0 ? listaRef : undefined}
            aria-hidden={copia === 1}
            className="flex shrink-0 items-center gap-x-24"
          >
            {itens.map((item) => (
              <li key={item.chave} className="whitespace-nowrap">
                <ItemLogo item={item} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  )
}

/**
 * Logo em `grayscale`, volta à cor no hover/foco da faixa inteira — o mesmo
 * tratamento que qualquer "as-featured-in" usa para a marca não competir com
 * o herói.
 */
function ItemLogo({ item }: { item: ItemFaixa }) {
  return (
    <img
      src={item.logo}
      alt={item.ondeE}
      className="h-16 w-auto shrink-0 opacity-70 grayscale transition-[opacity,filter] duration-300 group-hover:opacity-100 group-hover:grayscale-0"
      loading="lazy"
      decoding="async"
    />
  )
}
