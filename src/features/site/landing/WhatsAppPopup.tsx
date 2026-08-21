import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { WhatsAppGlyph } from '../../../components/icons/WhatsAppGlyph'
import { CONTATO } from '../../../lib/contato'

/**
 * O botão flutuante de WhatsApp, com o painel que abre dele.
 *
 * **É a casca para o bot de tira-dúvidas, não o bot.** Por enquanto ele não
 * responde nada sozinho: a mensagem que a pessoa digita abre o WhatsApp de
 * verdade, com o texto já preenchido, igual ao link que já existe na seção
 * de franqueza. Fingir uma conversa de bot que ainda não existe seria pior
 * que não ter o botão — vira exatamente o "meio pronto" que o CLAUDE.md deste
 * projeto pede pra evitar. Quando o agente de tira-dúvidas existir no n8n,
 * só o que acontece ao enviar muda; o resto do desenho fica.
 *
 * **Só existe com número real.** Segue a mesma regra da seção de franqueza:
 * sem CONTATO.whatsapp preenchido, este componente não renderiza nada — um
 * botão de WhatsApp que abre uma tela e não leva a lugar nenhum é pior do
 * que não ter o botão.
 *
 * **Por que fica ACIMA do CtaFixo.** Os dois são elementos fixos no canto
 * inferior. O CtaFixo publica a própria altura em `--cta-fixo-h` (ver
 * CtaFixo.tsx); este componente lê essa variável para empurrar a própria
 * posição para cima quando a barra de CTA está na tela, em vez de os dois
 * adivinharem a altura um do outro com números fixos.
 */
const MENSAGEM_PADRAO =
  'Oi! Ainda não temos um assistente automático por aqui, mas dá para falar direto com a gente. Manda sua dúvida que a gente responde.'

export function WhatsAppPopup() {
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const semMovimento = useReducedMotion()

  useEffect(() => {
    if (aberto) inputRef.current?.focus()
  }, [aberto])

  if (!CONTATO.whatsapp) return null
  const numero = CONTATO.whatsapp

  function enviar() {
    const texto = rascunho.trim()
    if (!texto) return
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noreferrer')
    setRascunho('')
    setAberto(false)
  }

  return (
    <div
      className="fixed right-4 z-50 sm:right-6"
      style={{ bottom: 'calc(20px + var(--cta-fixo-h, 0px))' }}
    >
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            role="dialog"
            aria-label="Falar no WhatsApp"
            className="absolute bottom-[calc(100%+14px)] right-0 flex w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--l-line-strong)] bg-[#121110] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center gap-2.5 bg-[#1c1b19] px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
                <WhatsAppGlyph className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">Club Cut</div>
                <div className="text-[10.5px] text-white/55">Responde pelo WhatsApp</div>
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

            <div className="px-3.5 py-4">
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2927] px-3.5 py-2.5 text-[13px] leading-snug text-white">
                  {MENSAGEM_PADRAO}
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                enviar()
              }}
              className="flex items-center gap-2 border-t border-white/10 bg-[#1c1b19] p-2.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                placeholder="Escreva sua dúvida..."
                className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/10"
              />
              <button
                type="submit"
                disabled={!rascunho.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-[opacity,transform] duration-200 active:scale-95 disabled:opacity-40"
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
        aria-label={aberto ? 'Fechar conversa no WhatsApp' : 'Abrir conversa no WhatsApp'}
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
    </div>
  )
}
