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
 * A LISTA ESTÁ VAZIA E A SEÇÃO NÃO APARECE ENQUANTO ESTIVER ASSIM.
 *
 * Só entra depoimento que existiu. Nome real, cidade real, número que saiu da
 * conta da pessoa, autorização por escrito. Inventar "o Marcos de Curitiba
 * reduziu 40% das faltas" é propaganda enganosa (CDC art. 37), e o dono que
 * assinar por causa de um número inventado descobre no primeiro mês.
 *
 * Uma página sem prova social convence menos. Uma página com prova social
 * falsa quebra a confiança de vez — e nesta página quebra junto a seção "Não
 * vamos prometer 70%", que é o posicionamento inteiro.
 *
 * COMO PREENCHER: peça autorização por escrito, confirme o número com quem
 * falou (o dono tira de Financeiro e da Agenda) e cole aqui. A seção aparece
 * sozinha assim que houver o primeiro item.
 * ────────────────────────────────────────────────────────────────────────────
 */
export type Depoimento = {
  /** Nome de quem falou, como a pessoa autorizou aparecer. */
  nome: string
  /** Barbearia e cidade. */
  ondeE: string
  /**
   * O que a pessoa disse, nas palavras dela. Curto: três linhas no máximo.
   * Não editar para soar melhor do que soou.
   */
  fala: string
  /**
   * Resultado com número, conferido com a pessoa. Sem número verificado,
   * deixe vazio e mostre só a fala — melhor sem número que com número torto.
   */
  resultado?: string
}

const DEPOIMENTOS: Depoimento[] = []

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
                  <p className="text-[clamp(1.2rem,2.4vw,1.7rem)] font-medium leading-[1.4] tracking-[-0.015em] text-[var(--l-fg)]">
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
