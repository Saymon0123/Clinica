import { useReducedMotion } from 'motion/react'
import { DEPOIMENTOS } from './Depoimentos'

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
 */
export function FaixaBarbearias() {
  const semMovimento = useReducedMotion()

  const nomes = DEPOIMENTOS.map((d) => d.ondeE)
  if (nomes.length === 0) return null

  const rotulo = `${nomes.length} barbearias que usam o Club Cut`

  /*
    Sem movimento, a faixa não vira uma versão devagar de si mesma: ela vira
    uma lista quieta e centralizada. Meia animação é pior que nenhuma para
    quem pediu para não ter animação.
  */
  if (semMovimento) {
    return (
      <section aria-label={rotulo} className="border-y border-[var(--l-line)] px-6 py-7">
        <ul className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-9 gap-y-3">
          {nomes.map((n) => (
            <li key={n} className="text-[15px] font-medium text-[var(--l-fg-mute)]">
              {n}
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
        Duas cópias da mesma lista, deslizando -50%. No fim do ciclo a segunda
        cópia está exatamente onde a primeira começou, então o laço não tem
        emenda visível. É por isso que a duplicata existe — não é redundância.

        A cópia é `aria-hidden`: o leitor de tela lê a lista uma vez só.
      */}
      <div className="faixa-desliza flex w-max gap-x-14 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
        {[0, 1].map((copia) => (
          <ul key={copia} aria-hidden={copia === 1} className="flex shrink-0 gap-x-14">
            {nomes.map((n) => (
              <li
                key={n}
                className="whitespace-nowrap text-[15px] font-medium text-[var(--l-fg-mute)]"
              >
                {n}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  )
}
