import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

/**
 * O "aconteceu!" depois do toque.
 *
 * Antes, o feedback de quase toda ação era a lista recarregando — sutil demais,
 * e a dúvida "será que foi?" fazia o barbeiro tocar duas vezes. Este toast é a
 * confirmação de meio segundo de atenção: aparece embaixo, some sozinho, nunca
 * pede clique.
 *
 * Pub/sub de módulo em vez de Context de propósito: o /web vive fora do
 * AppLayout, e qualquer arquivo pode chamar `toast('...')` sem fiação.
 */

type ToastItem = { id: number; texto: string }

let proximoId = 1
const ouvintes = new Set<(t: ToastItem) => void>()

export function toast(texto: string) {
  const item = { id: proximoId++, texto }
  ouvintes.forEach((fn) => fn(item))
}

const DURACAO_MS = 2600

export function Toasts() {
  const [itens, setItens] = useState<ToastItem[]>([])

  useEffect(() => {
    const receber = (t: ToastItem) => {
      setItens((atual) => [...atual.slice(-2), t])
      setTimeout(() => setItens((atual) => atual.filter((x) => x.id !== t.id)), DURACAO_MS)
    }
    ouvintes.add(receber)
    return () => {
      ouvintes.delete(receber)
    }
  }, [])

  if (itens.length === 0) return null

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {itens.map((t) => (
        <div
          key={t.id}
          role="status"
          className="flex items-center gap-2 bg-foreground text-background rounded-full px-4 py-2 text-sm font-medium shadow-lg motion-safe:animate-[toast-sobe_180ms_ease-out]"
        >
          <Check size={14} className="shrink-0" />
          {t.texto}
        </div>
      ))}
    </div>
  )
}
