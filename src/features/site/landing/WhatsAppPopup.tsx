import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Send, X } from 'lucide-react'
import { WhatsAppGlyph } from '../../../components/icons/WhatsAppGlyph'
import { useCtaInlineVisivel } from './useCtaInlineVisivel'

/**
 * O botão flutuante de WhatsApp, com o painel que abre dele.
 *
 * **É o bot de tira-dúvidas**, não um atalho pro WhatsApp real — a barbearia
 * ainda não tem um número público configurado (ver `lib/contato.ts`), e o
 * que promete aqui não depende disso: quem abre o painel conversa com um
 * agente de IA que responde sobre o Club Cut (preço, teste grátis, como
 * funciona). A pergunta vai pro n8n via `AGENTE_URL`; lá um agente com
 * modelo gratuito da OpenRouter responde com base só no que é real — nunca
 * inventa número, percentual ou recurso que o produto não tem.
 *
 * **O agente se chama Aurora** — nome derivado da marca "Aura" que já assina
 * o programa de reconhecimento e o rodapé do site. O nome mora aqui (na
 * saudação e no cabeçalho do painel) e no `systemMessage` do agente no n8n;
 * os dois precisam ficar em sincronia se um dia mudar.
 *
 * **Sem `AGENTE_URL` configurada, o painel avisa isso.** Enquanto o webhook
 * não estiver publicado (a credencial da OpenRouter é configurada à mão no
 * n8n, fora do repo), o campo fica desabilitado com "em breve" em vez de
 * fingir que responde — a mesma regra de nunca prometer o que ainda não
 * existe.
 *
 * **Por que fica ACIMA do CtaFixo.** Os dois são elementos fixos no canto
 * inferior. O CtaFixo publica a própria altura em `--cta-fixo-h` (ver
 * CtaFixo.tsx); este componente lê essa variável para empurrar a própria
 * posição para cima quando a barra de CTA está na tela, em vez de os dois
 * adivinharem a altura um do outro com números fixos.
 *
 * **Também some quando um CTA de seção (ou o rodapé) está na tela** — mesmo
 * sinal do `CtaFixo`, via `useCtaInlineVisivel`. Sem isso, o botão flutuava
 * por cima de título e texto toda vez que a página tinha um CTA de seção ou
 * o rodapé perto da borda inferior; nenhum elemento fixo precisa competir
 * com um botão que já está bem na frente da pessoa. Só se aplica quando o
 * painel está fechado — abrir o painel e ele sumir embaixo do dedo seria
 * pior que a sobreposição que resolve.
 */
const AGENTE_URL = import.meta.env.VITE_AGENTE_IA_URL as string | undefined

const SAUDACAO = 'Oi! Sou a Aurora, do Club Cut. Pergunta sobre preço, teste grátis ou como funciona — te respondo na hora.'

const MENSAGEM_SEM_AGENTE = 'Esse canal ainda não está ativo. Em breve dá para tirar dúvidas por aqui.'

const MENSAGEM_ERRO = 'Não consegui responder agora. Tenta de novo em instantes.'

const CHAVE_SESSAO = 'club-cut:popup-sessao'

function lerOuCriarSessao() {
  try {
    const existente = localStorage.getItem(CHAVE_SESSAO)
    if (existente) return existente
    const nova = crypto.randomUUID()
    localStorage.setItem(CHAVE_SESSAO, nova)
    return nova
  } catch {
    return crypto.randomUUID()
  }
}

type Mensagem = { autor: 'usuario' | 'bot'; texto: string }

/**
 * Um balão de mensagem entrando.
 *
 * Mesma entrada do `ChatDemo` e do `ProvaRobo` — os três chats da página
 * falam a mesma língua de propósito. Aqui isso importa mais que nos outros
 * dois: aquele é uma demonstração, este é a conversa de verdade, e era o
 * único dos três em que as mensagens apareciam secas, sem transição.
 */
function Balao({
  mensagem,
  semMovimento,
}: {
  mensagem: Mensagem
  semMovimento: boolean | null
}) {
  const doUsuario = mensagem.autor === 'usuario'
  return (
    <motion.div
      initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
      className={`flex ${doUsuario ? 'justify-end' : 'justify-start'}`}
    >
      <p
        className={
          doUsuario
            ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[#25D366] px-3.5 py-2.5 text-[13px] leading-snug text-black'
            : 'max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-2.5 text-[13px] leading-snug text-white'
        }
      >
        {mensagem.texto}
      </p>
    </motion.div>
  )
}

/**
 * Os três pontinhos enquanto a Aurora pensa.
 *
 * Era a palavra "digitando..." em texto estático — a única peça de chat da
 * página sem o indicador animado que o `ChatDemo` e o `ProvaRobo` já usam.
 * O laço infinito fica desligado sob `prefers-reduced-motion`: animação que
 * nunca termina é justamente a que mais incomoda quem pediu menos movimento.
 */
function Digitando({ semMovimento }: { semMovimento: boolean | null }) {
  return (
    <motion.div
      initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="flex justify-start"
      aria-label="Aurora está digitando"
    >
      <div className="flex gap-1 rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/60"
            animate={semMovimento ? undefined : { opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.16 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function WhatsAppPopup() {
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState('')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [enviando, setEnviando] = useState(false)
  const sessaoRef = useRef<string | undefined>(undefined)
  if (!sessaoRef.current) sessaoRef.current = lerOuCriarSessao()
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const semMovimento = useReducedMotion()
  const algumCtaVisivel = useCtaInlineVisivel()
  const oculto = algumCtaVisivel && !aberto

  useEffect(() => {
    if (aberto && AGENTE_URL) inputRef.current?.focus()
  }, [aberto])

  useEffect(() => {
    // `smooth` porque o balão está entrando animado: rolar seco por baixo de
    // uma mensagem que ainda está chegando faz o texto parecer que pulou.
    listaRef.current?.scrollTo({
      top: listaRef.current.scrollHeight,
      behavior: semMovimento ? 'auto' : 'smooth',
    })
  }, [mensagens, enviando, semMovimento])

  async function enviar() {
    const texto = rascunho.trim()
    if (!texto || enviando) return
    setRascunho('')

    if (!AGENTE_URL) {
      setMensagens((m) => [...m, { autor: 'usuario', texto }, { autor: 'bot', texto: MENSAGEM_SEM_AGENTE }])
      return
    }

    setMensagens((m) => [...m, { autor: 'usuario', texto }])
    setEnviando(true)
    try {
      const resposta = await fetch(AGENTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: texto, sessionId: sessaoRef.current }),
      })
      if (!resposta.ok) throw new Error('resposta não ok')
      const dados = (await resposta.json()) as { resposta?: string }
      setMensagens((m) => [...m, { autor: 'bot', texto: dados.resposta?.trim() || MENSAGEM_ERRO }])
    } catch {
      setMensagens((m) => [...m, { autor: 'bot', texto: MENSAGEM_ERRO }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <motion.div
      className="fixed right-4 z-50 sm:right-6"
      style={{ bottom: 'calc(20px + var(--cta-fixo-h, 0px))', pointerEvents: oculto ? 'none' : 'auto' }}
      animate={
        semMovimento
          ? { opacity: oculto ? 0 : 1 }
          : { opacity: oculto ? 0 : 1, y: oculto ? 8 : 0 }
      }
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      aria-hidden={oculto}
    >
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            role="dialog"
            aria-label="Tirar dúvidas com o Club Cut"
            className="absolute bottom-[calc(100%+14px)] right-0 flex w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line-strong)] bg-[#121110] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center gap-2.5 bg-[#1c1b19] px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
                <WhatsAppGlyph className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">Aurora</div>
                <div className="text-[10.5px] text-white/55">Assistente do Club Cut</div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listaRef} className="flex max-h-[min(50vh,360px)] flex-col gap-2 overflow-y-auto px-3.5 py-4">
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-2.5 text-[13px] leading-snug text-white">
                  {SAUDACAO}
                </p>
              </div>
              {mensagens.map((m, i) => (
                <Balao key={i} mensagem={m} semMovimento={semMovimento} />
              ))}
              <AnimatePresence>
                {enviando && <Digitando key="digitando" semMovimento={semMovimento} />}
              </AnimatePresence>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void enviar()
              }}
              className="flex items-center gap-2 border-t border-white/10 bg-[#1c1b19] p-2.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                disabled={!AGENTE_URL || enviando}
                placeholder={AGENTE_URL ? 'Escreva sua dúvida...' : 'Em breve'}
                className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {/*
                Avião de papel, e não o glifo do WhatsApp.

                O ícone do WhatsApp aqui prometia a ação errada: num campo de
                mensagem ele lê como "abrir o WhatsApp", e não é isso que o
                botão faz — a conversa acontece nesta página, com a Aurora. O
                avião é o símbolo que todo aplicativo de mensagem usa para
                "mandar esta mensagem", então não precisa ser aprendido.

                O verde do WhatsApp fica, porque a identidade da peça é essa;
                o que muda é só a ação que o ícone anuncia.
              */}
              <motion.button
                type="submit"
                disabled={!AGENTE_URL || !rascunho.trim() || enviando}
                whileTap={semMovimento ? undefined : { scale: 0.94 }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-[opacity,background-color] duration-200 hover:bg-[#1fb959] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Enviar mensagem"
              >
                {/* `translate-x-px` porque o avião do lucide tem o peso visual
                    à esquerda: centralizado na matemática, ele parece torto. */}
                <Send className="h-4 w-4 translate-x-px" />
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar conversa com o Club Cut' : 'Abrir conversa com o Club Cut'}
        whileTap={semMovimento ? undefined : { scale: 0.94 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_16px_36px_-12px_rgba(0,0,0,0.55)] transition-colors duration-200 hover:bg-[#1fb959]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {aberto ? (
            <motion.span
              key="fechar"
              initial={semMovimento ? { opacity: 0 } : { opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={semMovimento ? { opacity: 0 } : { opacity: 0, rotate: 45 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="abrir"
              initial={semMovimento ? { opacity: 0 } : { opacity: 0, rotate: 45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={semMovimento ? { opacity: 0 } : { opacity: 0, rotate: -45 }}
              transition={{ duration: 0.18 }}
            >
              <WhatsAppGlyph className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  )
}
