import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { ArrowLeft, BatteryFull, Check, CheckCheck, Mic, Phone, SignalHigh, Video, Wifi } from 'lucide-react'

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
 *
 * ─── 22:14 na barra de status ────────────────────────────────────────────────
 *
 * O H1 promete algo específico: "responde a mensagem das 22h na hora". Sem
 * relógio, essa promessa fica só na palavra. Com ele, quem olha o aparelho
 * confere o horário com os próprios olhos — a mesma lógica do "não acredita?
 * manda mensagem e pergunta" da seção de franqueza, aplicada aqui sem
 * depender de nenhum número de contato real.
 *
 * ─── Check duplo azul ────────────────────────────────────────────────────────
 *
 * Sinal mais reconhecível do WhatsApp para "isso é uma conversa de verdade,
 * não uma animação genérica". Cada balão do agente nasce com um check (enviado)
 * e vira dois azuis pouco depois — a fatia de tempo que separa envio de leitura
 * em qualquer conversa real.
 *
 * ─── Laço depois de terminar ─────────────────────────────────────────────────
 *
 * A conversa tocava uma vez só e ficava parada para sempre: quem lia o resto
 * da página e voltava para o topo encontrava um celular mudo. Ela reinicia
 * sozinha depois de um respiro, e não por reentrar na tela: `useInView` com
 * `once: false` foi tentado e descartado — qualquer reflow da página (fonte
 * assentando, imagem carregando) recalcula a interseção e reinicia o
 * temporizador da fala em andamento, travando a conversa no meio para sempre.
 * `once: true` é a versão estável: dispara uma vez, e o laço de repetição por
 * tempo dá o "celular vivo de novo" sem depender de scroll nenhum.
 */
type Fala = {
  de: 'cliente' | 'agente'
  texto: string
  /** Quanto tempo o balão leva "sendo digitado" antes de aparecer. */
  digitando: number
  /** Hora mostrada DENTRO do balão, como o WhatsApp faz. Avança de leve ao
   *  longo da conversa para ela ler como minutos reais, não como um print. */
  hora: string
}

const ROTEIRO: Fala[] = [
  { de: 'cliente', texto: 'Boa noite, quanto tá o corte com barba?', digitando: 700, hora: '22:14' },
  {
    de: 'agente',
    texto: 'Boa noite! Corte com barba fica R$ 65, leva 50 minutos.',
    digitando: 1100,
    hora: '22:14',
  },
  { de: 'cliente', texto: 'Consigo amanhã de manhã?', digitando: 800, hora: '22:15' },
  {
    de: 'agente',
    texto: 'Consigo sim. Amanhã tenho 9:00, 10:20 e 11:40 com o Rafael.',
    digitando: 1200,
    hora: '22:15',
  },
  { de: 'cliente', texto: 'Pode ser 10:20', digitando: 600, hora: '22:15' },
  {
    de: 'agente',
    texto: 'Marcado! Amanhã 10:20, corte com barba com o Rafael. Te lembro uma hora antes.',
    digitando: 1300,
    hora: '22:16',
  },
]

/** Pausa depois que o balão aparece, antes de o próximo começar a ser digitado. */
const RESPIRO = 620

/** Hora fixa da conversa, mostrada na barra de status — casa com o "22h" do H1. */
const HORA_CONVERSA = '22:14'

/** Quanto tempo depois de aparecer um balão do agente leva para o check virar duplo e azul. */
const CHECK_LIDO_MS = 900

function Balao({
  fala,
  comRabinho,
  semMovimento,
}: {
  fala: Fala
  /** Primeira bolha de um grupo do mesmo lado ganha o rabinho, como no
   *  WhatsApp; as seguintes saem retas. */
  comRabinho: boolean
  semMovimento: boolean
}) {
  const doAgente = fala.de === 'agente'
  const [lida, setLida] = useState(semMovimento)

  useEffect(() => {
    if (!doAgente || semMovimento) return
    const t = setTimeout(() => setLida(true), CHECK_LIDO_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
      className={`relative flex ${doAgente ? 'justify-end' : 'justify-start'}`}
    >
      {/*
        Cores do WhatsApp escuro de verdade, não uma paleta "inspirada":
        #005C4B na bolha enviada, #202C33 na recebida, texto #E9EDEF. O
        aparelho imita um objeto real e a imitação só convence exata.
      */}
      <div
        className={`relative max-w-[80%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-snug text-[#E9EDEF] shadow-[0_1px_1px_rgba(0,0,0,0.25)] ${
          doAgente ? 'bg-[#005C4B]' : 'bg-[#202C33]'
        } ${comRabinho ? (doAgente ? 'rounded-tr-none' : 'rounded-tl-none') : ''}`}
      >
        {comRabinho && (
          <svg
            aria-hidden="true"
            viewBox="0 0 8 13"
            className={`absolute top-0 h-[13px] w-2 ${
              doAgente ? '-right-2 text-[#005C4B]' : '-left-2 scale-x-[-1] text-[#202C33]'
            }`}
          >
            <path d="M0 0h8v13C8 6 4 2 0 0Z" fill="currentColor" transform="scale(-1,1) translate(-8,0)" />
          </svg>
        )}
        {fala.texto}
        {/*
          Hora dentro da bolha, canto de baixo, como o WhatsApp diagrama — com
          um respiro à esquerda para o texto não colar nela. Só o agente
          carrega check: é o dono do aparelho, e check aparece embaixo da
          PRÓPRIA mensagem, nunca da alheia.
        */}
        <span className="float-right ml-2 mt-[7px] flex translate-y-[2px] items-center gap-1">
          <span className={`text-[10px] leading-none ${doAgente ? 'text-[#E9EDEF]/60' : 'text-[#8696A0]'}`}>
            {fala.hora}
          </span>
          {doAgente && (
            <span
              className={`inline-flex transition-colors duration-300 ${
                lida ? 'text-[#53BDEB]' : 'text-[#8696A0]'
              }`}
            >
              {lida ? (
                <CheckCheck className="h-[14px] w-[14px]" strokeWidth={2.2} />
              ) : (
                <Check className="h-[14px] w-[14px]" strokeWidth={2.2} />
              )}
            </span>
          )}
        </span>
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
        className={`flex gap-1 rounded-lg px-3.5 py-3 text-[#E9EDEF] ${
          doAgente ? 'bg-[#005C4B]' : 'bg-[#202C33]'
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

/** Quanto tempo a conversa fica parada, terminada, antes de reiniciar sozinha. */
const PAUSA_ANTES_DE_REPETIR = 5000

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
    if (!naTela) return

    if (ditas >= ROTEIRO.length) {
      /*
        Terminou. Espera um respiro bem maior que entre falas — a pessoa
        precisa de tempo para ler o final antes de ver tudo sumir — e
        reinicia sozinha do zero. Não pausa quando a página rola para longe
        do herói: são só alguns timeouts leves, e o correto para quem VOLTA
        para o topo é encontrar a conversa correndo, não um celular parado no
        último quadro esperando ser notado de novo.
      */
      const t = setTimeout(() => {
        setDitas(0)
        setFase('pausa')
      }, PAUSA_ANTES_DE_REPETIR)
      return () => clearTimeout(t)
    }

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
      <div className="relative z-[1] overflow-hidden rounded-[34px] border border-[var(--l-line-strong)] bg-[#0a0e12] p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7)]">
        <div className="overflow-hidden rounded-[27px] bg-[#0B141A]">
          {/*
            Barra de status do aparelho, com a hora. O H1 promete "responde a
            mensagem das 22h na hora" — sem relógio essa promessa fica só na
            palavra; com ele, dá para conferir com os próprios olhos.
          */}
          <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-white/90">
            <span className="landing-num text-[12px] font-semibold">{HORA_CONVERSA}</span>
            <div className="flex items-center gap-1 opacity-80">
              <SignalHigh className="h-[13px] w-[13px]" strokeWidth={2.2} />
              <Wifi className="h-[13px] w-[13px]" strokeWidth={2.2} />
              <BatteryFull className="h-[15px] w-[15px]" strokeWidth={2} />
            </div>
          </div>

          {/* Cabeçalho da conversa, na diagramação do WhatsApp: seta de
              voltar, avatar, nome + online, vídeo e ligação à direita. */}
          <div className="flex items-center gap-2 bg-[#202C33] px-3 py-2.5">
            <ArrowLeft className="h-[17px] w-[17px] shrink-0 text-[#AEBAC1]" strokeWidth={2} />
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-[var(--l-accent)] text-[11px] font-bold text-[var(--l-on-accent)]">
              BC
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[#E9EDEF]">
                Barbearia Corte Certo
              </div>
              <div className="text-[11px] leading-tight text-[#8696A0]">online</div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-[#AEBAC1]">
              <Video className="h-[18px] w-[18px]" strokeWidth={2} />
              <Phone className="h-[16px] w-[16px]" strokeWidth={2} />
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
            className="flex h-[340px] flex-col justify-end gap-[3px] overflow-hidden px-3 py-3"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0, #000 48px)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 48px)',
              /* O "doodle" do fundo do WhatsApp, na versão pobre e suficiente:
                 uma trama de pontos quase invisível sobre o #0B141A. O padrão
                 real é um asset proprietário; a textura é o que o olho sente. */
              backgroundImage:
                'radial-gradient(rgba(233,237,239,0.045) 1px, transparent 1.6px)',
              backgroundSize: '18px 18px',
            }}
          >
            {ROTEIRO.slice(0, ditas).map((f, i) => (
              <div key={i} className={i > 0 && ROTEIRO[i - 1].de !== f.de ? 'mt-2' : ''}>
                <Balao
                  fala={f}
                  comRabinho={i === 0 || ROTEIRO[i - 1].de !== f.de}
                  semMovimento={!!semMovimento}
                />
              </div>
            ))}
            {/*
              Sem animação de saída: o indicador é SUBSTITUÍDO pelo balão, e não
              desaparece ao lado dele. Enquanto saía, ele continuava ocupando
              lugar no fluxo e as duas coisas se sobrepunham no mesmo canto.
            */}
            {digitando && <Digitando doAgente={digitando === 'agente'} />}
          </div>

          {/* Barra de escrever, decorativa: é ela que fecha a ilusão de
              aplicativo real. Não é input de verdade — aria-hidden, sem foco. */}
          <div aria-hidden="true" className="flex items-center gap-2 px-2.5 pb-3 pt-1">
            <div className="flex h-[38px] flex-1 items-center rounded-full bg-[#202C33] px-4 text-[13px] text-[#8696A0]">
              Mensagem
            </div>
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#00A884]">
              <Mic className="h-[17px] w-[17px] text-[#0B141A]" strokeWidth={2.2} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
