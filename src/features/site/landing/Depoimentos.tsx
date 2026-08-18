import { RevealGrupo, RevealItem, Reveal } from './primitivos'

/**
 * Depoimentos de donos de barbearia.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTA LISTA ESTÁ VAZIA DE PROPÓSITO, E A SEÇÃO NÃO APARECE ENQUANTO ELA
 * ESTIVER ASSIM. Isso não é pendência esquecida: é a regra da seção.
 *
 * Só entra depoimento que existiu. Nome real, cidade real, número que saiu da
 * conta da pessoa. Inventar "o Marcos de Curitiba reduziu 40% das faltas" seria
 * cômodo e é exatamente o que não pode: é propaganda enganosa, e o dono que
 * assinar o Club Cut por causa de um número inventado descobre no primeiro mês.
 *
 * Uma página sem prova social convence menos. Uma página com prova social falsa
 * quebra a confiança de vez, e leva o resto da página junto.
 *
 * COMO PREENCHER: peça autorização por escrito, confirme o número com quem
 * falou (o dono consegue tirar de Financeiro e da Agenda) e cole aqui. A seção
 * aparece sozinha assim que houver o primeiro item.
 * ────────────────────────────────────────────────────────────────────────────
 */
type Depoimento = {
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
  // Sem depoimento real, a seção inteira não existe. Não há estado "vazio"
  // desenhado de propósito: um espaço reservado dizendo "em breve" só anuncia
  // que ninguém usa o produto ainda.
  if (DEPOIMENTOS.length === 0) return null

  return (
    <section className="relative overflow-hidden px-6 py-[104px] lg:py-[150px]">
      <div className="relative z-[1] mx-auto max-w-[1180px]">
        <Reveal>
          <h2 className="landing-display text-[clamp(2rem,4.6vw,3.4rem)] text-[var(--l-fg)]">
            Quem já deixou de perder cliente
          </h2>
        </Reveal>

        <RevealGrupo className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3" intervalo={0.08}>
          {DEPOIMENTOS.map((d) => (
            <RevealItem key={d.nome}>
              <figure className="card flex h-full flex-col rounded-[var(--r-md)] p-7 sm:p-8">
                {d.resultado && (
                  <div className="landing-num mb-5 text-[28px] text-[var(--l-ink-deep)]">
                    {d.resultado}
                  </div>
                )}
                <blockquote className="flex-1 text-[16px] leading-relaxed text-[var(--l-fg)]">
                  {d.fala}
                </blockquote>
                <figcaption className="mt-6 border-t border-[var(--l-line)] pt-5">
                  <div className="text-[14px] font-semibold text-[var(--l-fg)]">{d.nome}</div>
                  <div className="mt-0.5 text-[13px] text-[var(--l-fg-faint)]">{d.ondeE}</div>
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealGrupo>
      </div>
    </section>
  )
}
