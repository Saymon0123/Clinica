import { useState } from 'react'
import { PRECO_PRO } from '../../../lib/planos'

/**
 * A conta da cadeira vazia.
 *
 * A página afirma que "uma cadeira vazia por semana já custa mais que isso".
 * Aqui o dono confere isso com os números dele em vez de acreditar na frase.
 * Uma conta que a pessoa faz sozinha convence mais do que qualquer número que
 * a gente escrevesse na tela.
 *
 * **Nada aqui é promessa de resultado.** Não diz que o Club Cut evita essas
 * faltas nem quanto ele recupera: mostra o tamanho do buraco que já existe,
 * com valores que o próprio dono move. Prometer "reduza 40% das faltas" sem
 * medição seria número inventado, e é exatamente o que não entra nesta página.
 */
const MIN_FALTAS = 1
const MAX_FALTAS = 10
const MIN_PRECO = 25
const MAX_PRECO = 150

/** Quatro semanas por mês. Redondo de propósito: é uma estimativa, não contabilidade. */
const SEMANAS_NO_MES = 4

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function Controle({
  rotulo,
  valor,
  min,
  max,
  passo,
  aoMudar,
  formata,
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  passo: number
  aoMudar: (v: number) => void
  formata: (v: number) => string
}) {
  const fracao = (valor - min) / (max - min)

  /*
    O polegar não anda de 0% a 100% do trilho: ele é recuado por metade da
    própria largura nas duas pontas, senão sairia da barra. Pintar o
    preenchimento com a fração crua deixa a cor adiantada em relação à bolinha,
    e a diferença aparece justo no meio do curso. Daí a conta com a largura do
    polegar em vez de porcentagem simples.
  */
  const parada = `calc(${fracao} * (100% - var(--polegar)) + var(--polegar) / 2)`

  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-[14px] text-[var(--l-fg-mute)]">{rotulo}</span>
        <span className="landing-num text-[19px] text-[var(--l-fg)]">{formata(valor)}</span>
      </span>

      {/*
        `input type=range` nativo, e não um controle de biblioteca: já vem com
        teclado, leitor de tela e o gesto de arrastar que o sistema entende. O
        que falta é só a pintura. Um slider de biblioteca traria Radix e o
        shadcn junto, que é um segundo sistema de design dentro do projeto para
        resolver o que o navegador já resolve.
      */}
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={
          {
            '--polegar': '18px',
            background: `linear-gradient(to right, var(--l-accent) ${parada}, rgba(14,15,12,0.14) ${parada})`,
          } as React.CSSProperties
        }
      />
    </label>
  )
}

export function Calculadora() {
  const [faltas, setFaltas] = useState(2)
  const [preco, setPreco] = useState(55)

  const porMes = faltas * preco * SEMANAS_NO_MES
  const sobra = porMes - PRECO_PRO

  return (
    <div className="card rounded-[var(--r-md)] p-7 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-8">
          <Controle
            rotulo="Faltas e desistências por semana"
            valor={faltas}
            min={MIN_FALTAS}
            max={MAX_FALTAS}
            passo={1}
            aoMudar={setFaltas}
            formata={(v) => `${v}`}
          />
          <Controle
            rotulo="Preço médio do seu atendimento"
            valor={preco}
            min={MIN_PRECO}
            max={MAX_PRECO}
            passo={5}
            aoMudar={setPreco}
            formata={moeda}
          />
        </div>

        <div className="flex flex-col justify-center border-t border-[var(--l-line)] pt-8 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
          <div className="text-[14px] text-[var(--l-fg-mute)]">
            Cadeira vazia, por mês
          </div>
          {/* `aria-live` para quem usa leitor de tela ouvir o valor mudar ao
              arrastar, em vez de o número trocar em silêncio. */}
          <div
            aria-live="polite"
            className="landing-num mt-2 text-[clamp(2.4rem,6vw,3.6rem)] text-[var(--l-ink-deep)]"
          >
            {moeda(porMes)}
          </div>

          <p className="mt-6 max-w-[34ch] text-[15px] leading-relaxed text-[var(--l-fg-mute)]">
            {sobra > 0 ? (
              <>
                É {moeda(sobra)} a mais do que o plano Pro custa no mês. A conta é com os seus
                números.
              </>
            ) : (
              <>
                Ainda abaixo do plano Pro. Mesmo assim, são {moeda(porMes)} que passaram pela porta
                e não ficaram.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
