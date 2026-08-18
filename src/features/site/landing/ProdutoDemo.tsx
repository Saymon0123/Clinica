import { motion, useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
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
  feito: { rotulo: 'Atendido', classe: 'bg-[rgba(14,15,12,0.06)] text-[var(--l-fg-faint)]' },
  cadeira: { rotulo: 'Na cadeira', classe: 'bg-[var(--l-accent-pale)] text-[#054d28]' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-[var(--l-accent-pale)] text-[#054d28]' },
  aguardando: { rotulo: 'Aguardando', classe: 'bg-[rgba(14,15,12,0.06)] text-[var(--l-fg-mute)]' },
}

function Agenda() {
  const ref = useRef<HTMLDivElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.3 })
  const semMovimento = useReducedMotion()

  return (
    <div ref={ref} className="card rounded-[var(--r-md)] p-6 sm:p-9">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-semibold text-[var(--l-fg)]">Agenda de hoje</div>
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
              <span className="w-[46px] shrink-0 text-[13px] font-semibold tabular-nums text-[var(--l-fg-mute)]">
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
          destaque ? 'bg-[var(--l-accent)]' : 'bg-[rgba(14,15,12,0.12)]'
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
    <div className="card rounded-[var(--r-md)] p-6 sm:p-9">
      <div className="text-[15px] font-semibold text-[var(--l-fg)]">Caixa da semana</div>

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
            <span className="font-semibold tabular-nums text-[var(--l-fg)]">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProdutoDemo() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Agenda />
      <Caixa />
    </div>
  )
}
