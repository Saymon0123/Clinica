import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
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
 *
 * Cada controle tem DUAS entradas para o mesmo valor: o slider para explorar e
 * o campo para quem já sabe o número de cabeça. "Meu corte é R$ 70" digitado é
 * mais convincente que R$ 70 arrastado, porque foi a pessoa que afirmou.
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

function limita(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function Controle({
  rotulo,
  valor,
  min,
  max,
  passo,
  aoMudar,
  prefixo = '',
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  passo: number
  aoMudar: (v: number) => void
  prefixo?: string
}) {
  /*
    O campo digitável tem estado próprio de texto, e não espelha `valor` letra a
    letra: prender o input ao número limitado impediria a pessoa de apagar tudo
    para digitar de novo (o "" viraria `min` no meio da digitação). O limite só
    é aplicado quando ela sai do campo ou dá Enter.
  */
  const [texto, setTexto] = useState(String(valor))
  const editando = useRef(false)
  useEffect(() => {
    if (!editando.current) setTexto(String(valor))
  }, [valor])

  function confirmar() {
    editando.current = false
    const n = Number(texto.replace(/\D/g, ''))
    const v = Number.isFinite(n) && texto !== '' ? limita(n, min, max) : valor
    aoMudar(v)
    setTexto(String(v))
  }

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
      <span className="flex items-center justify-between gap-4">
        <span className="text-[14px] text-[var(--l-fg-mute)]">{rotulo}</span>
        <span className="flex items-baseline gap-1 rounded-[10px] border border-[var(--l-line)] bg-[var(--l-bg)] px-3 py-1.5 transition-colors duration-200 focus-within:border-[var(--l-accent-ink)]">
          {prefixo && <span className="text-[13px] text-[var(--l-fg-faint)]">{prefixo}</span>}
          {/*
            `text` + inputmode numérico, e não type=number: o number nativo traz
            spinner, aceita "e" e "-", e cada navegador valida de um jeito. Aqui
            a validação é nossa e o teclado do celular já abre numérico.
          */}
          <input
            type="text"
            inputMode="numeric"
            value={texto}
            onFocus={(e) => {
              editando.current = true
              e.target.select()
            }}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="landing-num w-[3ch] bg-transparent text-right text-[19px] text-[var(--l-fg)] outline-none"
            aria-label={rotulo}
          />
        </span>
      </span>

      {/*
        `input type=range` nativo, e não um controle de biblioteca: já vem com
        teclado, leitor de tela e o gesto de arrastar que o sistema entende. O
        que falta é só a pintura.
      */}
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        aria-hidden="true"
        tabIndex={-1}
        style={
          {
            '--polegar': '18px',
            background: `linear-gradient(to right, var(--l-accent-ink) ${parada}, rgba(243,241,234,0.16) ${parada})`,
          } as React.CSSProperties
        }
      />
    </label>
  )
}

/**
 * O resultado rola até o valor novo em vez de trocar seco.
 *
 * É o micro-feedback da interação inteira: a pessoa arrasta e VÊ o buraco
 * crescer. Escreve direto no nó de texto, fora do render do React — são ~60
 * atualizações por segundo durante o arrasto.
 */
function ValorAnimado({ valor }: { valor: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const anterior = useRef(valor)
  const semMovimento = useReducedMotion()

  useEffect(() => {
    const no = ref.current
    if (!no) return
    if (semMovimento) {
      no.textContent = moeda(valor)
      anterior.current = valor
      return
    }
    const controle = animate(anterior.current, valor, {
      duration: 0.5,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        no.textContent = moeda(Math.round(v))
      },
    })
    anterior.current = valor
    return () => controle.stop()
  }, [valor, semMovimento])

  return <span ref={ref}>{moeda(valor)}</span>
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
          />
          <Controle
            rotulo="Preço médio do seu atendimento"
            valor={preco}
            min={MIN_PRECO}
            max={MAX_PRECO}
            passo={5}
            aoMudar={setPreco}
            prefixo="R$"
          />
        </div>

        <div className="flex flex-col justify-center border-t border-[var(--l-line)] pt-8 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
          <div className="landing-label text-[var(--l-fg-mute)]">Cadeira vazia, por mês</div>
          {/* `aria-live` para quem usa leitor de tela ouvir o valor mudar ao
              arrastar, em vez de o número trocar em silêncio. */}
          <div
            aria-live="polite"
            className="landing-num mt-3 text-[clamp(2.4rem,6vw,3.6rem)] text-[var(--l-accent-ink)]"
          >
            <ValorAnimado valor={porMes} />
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
