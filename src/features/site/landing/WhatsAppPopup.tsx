import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
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

const SAUDACAO = 'Oi! Sou o assistente do Club Cut. Pergunta sobre preço, teste grátis ou como funciona — te respondo na hora.'

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
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight })
  }, [mensagens, enviando])

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
                <div className="truncate text-[13px] font-semibold text-white">Club Cut</div>
                <div className="text-[10.5px] text-white/55">Assistente automático</div>
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
                <div key={i} className={`flex ${m.autor === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                  <p
                    className={
                      m.autor === 'usuario'
                        ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[#25D366] px-3.5 py-2.5 text-[13px] leading-snug text-black'
                        : 'max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-2.5 text-[13px] leading-snug text-white'
                    }
                  >
                    {m.texto}
                  </p>
                </div>
              ))}
              {enviando && (
                <div className="flex justify-start">
                  <p className="rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-2.5 text-[13px] leading-snug text-white/50">
                    digitando...
                  </p>
                </div>
              )}
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
              <button
                type="submit"
                disabled={!AGENTE_URL || !rascunho.trim() || enviando}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-[opacity,transform] duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Enviar"
              >
                <WhatsAppGlyph className="h-4 w-4" />
              </button>
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
