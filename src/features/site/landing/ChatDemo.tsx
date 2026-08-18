import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'

/**
 * A conversa do WhatsApp acontecendo.
 *
 * É a peça que vende o produto sozinho: o dono de barbearia não quer ler que o
 * atendimento responde, quer VER respondendo. Por isso é uma conversa que roda
 * de verdade, com o "digitando" no tempo certo, e não uma captura de tela.
 *
 * **O roteiro só mostra o que o sistema faz hoje**: o agente responde preço,
 * oferece horário livre e marca. Nada de confirmar pagamento ou puxar
 * histórico, que não existem. Se a conversa prometer mais que o produto, a
 * reclamação chega no primeiro dia de uso.
 */
type Fala = {
  de: 'cliente' | 'agente'
  texto: string
  /** Quanto tempo o balão leva "sendo digitado" antes de aparecer. */
  digitando: number
}

const ROTEIRO: Fala[] = [
  { de: 'cliente', texto: 'Boa noite, quanto tá o corte com barba?', digitando: 700 },
  {
    de: 'agente',
    texto: 'Boa noite! Corte com barba fica R$ 65, leva 50 minutos.',
    digitando: 1100,
  },
  { de: 'cliente', texto: 'Consigo amanhã de manhã?', digitando: 800 },
  {
    de: 'agente',
    texto: 'Consigo sim. Amanhã tenho 9:00, 10:20 e 11:40 com o Rafael.',
    digitando: 1200,
  },
  { de: 'cliente', texto: 'Pode ser 10:20', digitando: 600 },
  {
    de: 'agente',
    texto: 'Marcado! Amanhã 10:20, corte com barba com o Rafael. Te lembro uma hora antes.',
    digitando: 1300,
  },
]

/** Pausa depois que o balão aparece, antes de o próximo começar a ser digitado. */
const RESPIRO = 620

function Balao({ fala }: { fala: Fala }) {
  const doAgente = fala.de === 'agente'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
      className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
          doAgente
            ? 'rounded-br-md bg-[#10684f] text-[#ecfdf5]'
            : 'rounded-bl-md bg-[#2a2927] text-white'
        }`}
      >
        {fala.texto}
      </div>
    </motion.div>
  )
}

function Digitando({ doAgente }: { doAgente: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex gap-1 rounded-2xl px-3.5 py-3 ${
          doAgente ? 'rounded-br-md bg-[#10684f]' : 'rounded-bl-md bg-[#2a2927]'
        }`}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
            animate={{ opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.16 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const naTela = useInView(ref, { once: true, amount: 0.4 })
  const semMovimento = useReducedMotion()

  const [ditas, setDitas] = useState(0)
  /**
   * Duas fases por mensagem: primeiro o silêncio depois do balão anterior,
   * depois o "digitando". Sem a fase de pausa os três pontinhos reaparecem no
   * mesmo quadro em que o balão anterior assenta, e a conversa fica com
   * cadência de robô em vez de gente.
   */
  const [fase, setFase] = useState<'pausa' | 'digitando'>('pausa')

  useEffect(() => {
    // Quem pediu menos movimento recebe a conversa inteira de uma vez. É o
    // conteúdo que importa, e ele não pode depender da animação para existir.
    if (semMovimento) {
      setDitas(ROTEIRO.length)
      return
    }
    if (!naTela || ditas >= ROTEIRO.length) return

    if (fase === 'pausa') {
      // A primeira fala entra quase imediatamente: a pessoa acabou de chegar na
      // página e uma conversa parada por meio segundo parece quebrada.
      const espera = ditas === 0 ? 260 : RESPIRO
      const t = setTimeout(() => setFase('digitando'), espera)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => {
      setDitas((n) => n + 1)
      setFase('pausa')
    }, ROTEIRO[ditas].digitando)
    return () => clearTimeout(t)
  }, [naTela, ditas, fase, semMovimento])

  const digitando =
    !semMovimento && naTela && fase === 'digitando' && ditas < ROTEIRO.length
      ? ROTEIRO[ditas].de
      : null

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[330px]">
      {/*
        O aparelho tem cor propria, e nao os tokens da pagina.

        A landing e clara agora; a tela de um celular com WhatsApp aberto nao é.
        Herdar os tokens deixaria o texto do cabecalho em tinta escura sobre a
        tela escura, ou seja, invisivel. O aparelho e objeto fisico simulado, e
        objeto simulado segue a aparencia do que imita.
      */}
      <div className="relative z-[1] overflow-hidden rounded-[34px] border border-[var(--l-line-strong)] bg-[#0e0f0c] p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7)]">
        <div className="overflow-hidden rounded-[27px] bg-[#121110]">
          {/* Cabeçalho da conversa */}
          <div className="flex items-center gap-2.5 border-b border-white/10 bg-[#1c1b19] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--l-accent)] text-[12px] font-bold text-[var(--l-on-accent)]">
              BC
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white">
                Barbearia Corte Certo
              </div>
              <div className="text-[10.5px] text-white/55">online</div>
            </div>
          </div>

          {/*
            Altura fixa com corte, e não altura mínima. Crescendo livre, a
            conversa passava da moldura do aparelho e os últimos balões
            apareciam fora dele.

            `justify-end` mantém a última mensagem colada embaixo e empurra as
            antigas para cima, que é o comportamento de qualquer conversa real.
            A máscara desmancha o topo em vez de cortar na régua.
          */}
          <div
            className="flex h-[356px] flex-col justify-end gap-2 overflow-hidden px-3.5 py-4"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0, #000 56px)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 56px)',
            }}
          >
            {ROTEIRO.slice(0, ditas).map((f, i) => (
              <Balao key={i} fala={f} />
            ))}
            {/*
              Sem animação de saída: o indicador é SUBSTITUÍDO pelo balão, e não
              desaparece ao lado dele. Enquanto saía, ele continuava ocupando
              lugar no fluxo e as duas coisas se sobrepunham no mesmo canto.
            */}
            {digitando && <Digitando doAgente={digitando === 'agente'} />}
          </div>
        </div>
      </div>
    </div>
  )
}
