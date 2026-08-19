import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import { Contador } from './primitivos'

/**
 * A agenda e o caixa, por dentro.
 *
 * O chat mostra o agente conversando; esta peça responde à pergunta seguinte,
 * que é "e o que sobra pra mim?". Sem ela o produto parece um bot de WhatsApp
 * em vez de um sistema.
 *
 * É uma versão viva e reduzida das telas reais, montada com os mesmos elementos
 * do CRM, e não uma captura de tela desenhada por cima. Assim ela não envelhece
 * junto com um print antigo e mostra o produto em movimento.
 */

/** Agendamentos de um dia qualquer. Nomes e serviços plausíveis, horários coerentes. */
const DIA = [
  { hora: '09:00', cliente: 'Vinícius Aparecido', servico: 'Corte', estado: 'feito' },
  { hora: '10:20', cliente: 'Ederson Bastos', servico: 'Corte e barba', estado: 'cadeira' },
  { hora: '11:40', cliente: 'Josué Ramalho', servico: 'Barba', estado: 'confirmado' },
  { hora: '13:30', cliente: 'Wallace Petrucci', servico: 'Corte', estado: 'confirmado' },
  { hora: '14:50', cliente: 'Tarcísio Moura', servico: 'Corte e barba', estado: 'aguardando' },
] as const

const ESTADO: Record<string, { rotulo: string; classe: string }> = {
  feito: { rotulo: 'Atendido', classe: 'bg-[rgba(243,241,234,0.07)] text-[var(--l-fg-faint)]' },
  // Estado positivo: fundo do acento em alfa com o verde claro por cima. O
  // chip e informacao, nao acao — por isso usa o par pale/ink, nunca o verde
  // solido do botao.
  cadeira: { rotulo: 'Na cadeira', classe: 'bg-[var(--l-ok-pale)] text-[var(--l-ok)]' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-[var(--l-ok-pale)] text-[var(--l-ok)]' },
  aguardando: { rotulo: 'Aguardando', classe: 'bg-[rgba(243,241,234,0.07)] text-[var(--l-fg-mute)]' },
}

function Agenda() {
  const ref = useRef<HTMLDivElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.3 })
  const semMovimento = useReducedMotion()

  return (
    <div ref={ref} className="card rounded-[var(--r-md)] p-6 sm:p-9">
      <div className="flex items-baseline justify-between">
        <div className="landing-label text-[var(--l-fg-mute)]">Agenda de hoje</div>
        <div className="text-[12px] text-[var(--l-fg-faint)]">Rafael</div>
      </div>

      <div className="mt-7 flex flex-col gap-2">
        {DIA.map((a, i) => {
          const e = ESTADO[a.estado]
          return (
            <motion.div
              key={a.hora}
              initial={semMovimento ? false : { opacity: 0, x: -10 }}
              animate={naTela || semMovimento ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.42, delay: i * 0.07, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center gap-3.5 rounded-[var(--r-sm)] border border-[var(--l-line)] bg-[var(--l-bg)]/60 px-4 py-3.5"
            >
              <span className="landing-num w-[46px] shrink-0 text-[12.5px] text-[var(--l-fg-mute)]">
                {a.hora}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[var(--l-fg)]">
                  {a.cliente}
                </span>
                <span className="block truncate text-[12px] text-[var(--l-fg-faint)]">
                  {a.servico}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${e.classe}`}
              >
                {e.rotulo}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/** Barra de faturamento. Altura em transform para não disparar reflow a cada frame. */
function Barra({ altura, destaque, atraso }: { altura: number; destaque: boolean; atraso: number }) {
  const semMovimento = useReducedMotion()
  return (
    <div className="flex h-full flex-1 items-end">
      <motion.span
        className={`w-full origin-bottom rounded-t-[3px] ${
          destaque ? 'bg-[var(--l-accent-ink)]' : 'bg-[rgba(243,241,234,0.14)]'
        }`}
        style={{ height: `${altura}%` }}
        initial={semMovimento ? false : { scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, delay: atraso, ease: [0.23, 1, 0.32, 1] }}
      />
    </div>
  )
}

const SEMANA = [
  { dia: 'S', v: 38 },
  { dia: 'T', v: 52 },
  { dia: 'Q', v: 46 },
  { dia: 'Q', v: 64 },
  { dia: 'S', v: 88 },
  { dia: 'S', v: 100 },
]

function Caixa() {
  return (
    <div className="card h-full rounded-[var(--r-md)] p-6 sm:p-9">
      <div className="landing-label text-[var(--l-fg-mute)]">Caixa da semana</div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[15px] text-[var(--l-fg-mute)]">R$</span>
        <span className="landing-num text-4xl text-[var(--l-fg)] sm:text-[42px]">
          <Contador ate={4820} />
        </span>
      </div>

      <div className="mt-7 flex h-32 items-end gap-2.5">
        {SEMANA.map((d, i) => (
          <Barra key={i} altura={d.v} destaque={i === SEMANA.length - 1} atraso={i * 0.06} />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {SEMANA.map((d, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[10.5px] font-medium text-[var(--l-fg-faint)]"
          >
            {d.dia}
          </span>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2.5 border-t border-[var(--l-line)] pt-5">
        {[
          ['Rafael', '48%', 'R$ 1.310'],
          ['Deivid', '45%', 'R$ 980'],
        ].map(([nome, pct, valor]) => (
          <div key={nome} className="flex items-center justify-between text-[12.5px]">
            <span className="text-[var(--l-fg-mute)]">
              {nome} <span className="text-[var(--l-fg-faint)]">· comissão {pct}</span>
            </span>
            <span className="landing-num text-[12.5px] text-[var(--l-fg)]">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Clientes que já cortaram, com a última visita. */
const CLIENTES = [
  { nome: 'Ederson Bastos', ultima: 'há 3 semanas', cortes: 14 },
  { nome: 'Josué Ramalho', ultima: 'há 1 mês', cortes: 9 },
  { nome: 'Wallace Petrucci', ultima: 'há 2 meses', cortes: 6 },
  { nome: 'Tarcísio Moura', ultima: 'há 5 dias', cortes: 21 },
]

function Clientes() {
  return (
    <div className="card h-full rounded-[var(--r-md)] p-6 sm:p-9">
      <div className="landing-label text-[var(--l-fg-mute)]">Quem já cortou com você</div>

      <div className="mt-7 flex flex-col gap-2.5">
        {CLIENTES.map((c) => (
          <div
            key={c.nome}
            className="flex items-center justify-between gap-3 border-b border-[var(--l-line)] pb-2.5 last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-[var(--l-fg)]">
                {c.nome}
              </span>
              <span className="block text-[12px] text-[var(--l-fg-faint)]">{c.ultima}</span>
            </span>
            <span className="landing-num shrink-0 text-[13px] text-[var(--l-fg-mute)]">
              {c.cortes} cortes
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/*
  A agenda fica FIXA e só o painel da direita troca.

  Tabular a seção inteira mostraria menos de cada vez do que o lado a lado que
  havia antes -- seria regressao disfarcada de recurso. Com a agenda ancorada,
  cada aba ACRESCENTA: a pessoa vê sempre o dia mais uma coisa que ele alimenta.
*/
const ABAS = [
  { id: 'caixa', rotulo: 'Caixa', painel: Caixa },
  { id: 'clientes', rotulo: 'Clientes', painel: Clientes },
] as const

export function ProdutoDemo() {
  const [aba, setAba] = useState(0)
  const semMovimento = useReducedMotion()
  const base = useId()
  const Painel = ABAS[aba].painel

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Agenda />

      <div className="flex flex-col gap-3">
        {/* `role=tablist` com as setas do teclado é o que o leitor de tela e o
            usuário de teclado esperam de abas. */}
        <div role="tablist" aria-label="O que a agenda alimenta" className="flex gap-2">
          {ABAS.map((a, i) => (
            <button
              key={a.id}
              role="tab"
              type="button"
              id={`${base}-${a.id}`}
              aria-selected={aba === i}
              aria-controls={`${base}-${a.id}-painel`}
              tabIndex={aba === i ? 0 : -1}
              onClick={() => setAba(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setAba((n) => (n + 1) % ABAS.length)
                if (e.key === 'ArrowLeft') setAba((n) => (n - 1 + ABAS.length) % ABAS.length)
              }}
              className={`landing-label rounded-full px-4 py-2 transition-colors duration-200 ${
                aba === i
                  ? 'bg-[var(--l-accent-pale)] text-[var(--l-accent-ink)]'
                  : 'text-[var(--l-fg-faint)] hover:text-[var(--l-fg-mute)]'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`${base}-${ABAS[aba].id}-painel`}
          aria-labelledby={`${base}-${ABAS[aba].id}`}
          className="flex-1"
        >
          {/* `mode="wait"` para o painel que sai terminar antes de o novo
              entrar: sobrepostos, os dois disputam a mesma célula e a troca
              pisca. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={ABAS[aba].id}
              className="h-full"
              initial={semMovimento ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <Painel />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
