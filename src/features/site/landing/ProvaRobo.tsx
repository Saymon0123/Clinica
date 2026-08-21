import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'

/**
 * A franqueza, mostrada em vez de só afirmada.
 *
 * "Franqueza" prometia "se o cliente perguntar se é robô, ele responde que
 * é" e não mostrava a conversa acontecendo — era a única seção da página
 * com uma afirmação de comportamento sem nenhuma peça visual ao lado, só
 * texto sobre um lado vazio da tela.
 *
 * Não é o `ChatDemo` do herói de novo: aquele mostra a mecânica central
 * (preço, horário, agendamento) e roda como conversa completa. Este mostra
 * só a exceção que a seção promete — a pergunta direta e a resposta direta
 * — como um recorte pequeno, não outro aparelho de celular inteiro
 * competindo com o do herói. Mesma barbearia fictícia do ChatDemo, para não
 * introduzir uma segunda identidade de demonstração.
 */
const CLIENTE = 'Oi, você é um robô?'
const AGENTE = 'Sou, sim. Mas resolvo do mesmo jeito — quer ver os horários?'

/** Pausa antes do "digitando" da resposta: pergunta direta merece pausa curta. */
const PAUSA_MS = 550
/** Quanto tempo o indicador de "digitando" fica visível antes do balão da resposta. */
const DIGITANDO_MS = 900

function Bolha({ texto, doAgente }: { texto: string; doAgente: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${
          doAgente
            ? 'rounded-br-md bg-[#10684f] text-[#ecfdf5]'
            : 'rounded-bl-md bg-[#2a2927] text-white'
        }`}
      >
        {texto}
      </div>
    </motion.div>
  )
}

function Digitando() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-end"
    >
      <div className="flex gap-1 rounded-2xl rounded-br-md bg-[#10684f] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-current text-[#ecfdf5] opacity-60"
            animate={{ opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.16 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function ProvaRobo() {
  const ref = useRef<HTMLDivElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.5 })
  const semMovimento = useReducedMotion()

  const [etapa, setEtapa] = useState<'espera' | 'pergunta' | 'digitando' | 'resposta'>('espera')

  useEffect(() => {
    if (semMovimento) {
      setEtapa('resposta')
      return
    }
    if (!naTela || etapa !== 'espera') return

    const t1 = setTimeout(() => setEtapa('pergunta'), 200)
    return () => clearTimeout(t1)
  }, [naTela, etapa, semMovimento])

  useEffect(() => {
    if (semMovimento || etapa !== 'pergunta') return
    const t = setTimeout(() => setEtapa('digitando'), PAUSA_MS)
    return () => clearTimeout(t)
  }, [etapa, semMovimento])

  useEffect(() => {
    if (semMovimento || etapa !== 'digitando') return
    const t = setTimeout(() => setEtapa('resposta'), DIGITANDO_MS)
    return () => clearTimeout(t)
  }, [etapa, semMovimento])

  const mostraPergunta = etapa === 'pergunta' || etapa === 'digitando' || etapa === 'resposta'
  const mostraDigitando = etapa === 'digitando'
  const mostraResposta = etapa === 'resposta'

  return (
    <div ref={ref} className="card-suave rounded-[var(--r-md)] p-5 sm:p-6">
      {/* Mesma identidade do ChatDemo do herói: uma demonstração, não duas. */}
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-3.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--l-accent)] text-[11px] font-bold text-[var(--l-on-accent)]">
          BC
        </span>
        <div className="text-[12.5px] font-semibold text-[var(--l-fg)]">
          Barbearia Corte Certo
        </div>
      </div>

      <div className="mt-4 flex min-h-[104px] flex-col justify-end gap-2">
        {mostraPergunta && <Bolha texto={CLIENTE} doAgente={false} />}
        {mostraDigitando && <Digitando />}
        {mostraResposta && <Bolha texto={AGENTE} doAgente={true} />}
      </div>
    </div>
  )
}
