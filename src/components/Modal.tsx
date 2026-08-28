import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * O modal único do CRM.
 *
 * Antes eram 21 modais escritos à mão em 4 dialetos (z-index, raio, sombra e
 * tamanho divergentes; 4 deles com a classe inexistente `border-border-lg` e
 * portanto sem borda nenhuma). Este componente fecha as decisões:
 *
 * - Entrada animada (150ms, curva forte) e overlay com fade — ver index.css.
 * - Esc fecha, overlay fecha, `role="dialog"` + `aria-modal`.
 * - Scroll do body travado enquanto aberto.
 * - Escala de tamanho fechada: xs/sm/md/lg. Fora disso não existe.
 * - z-50 sempre. Toast é z-[60] e Tour z-[62], então continuam por cima.
 *
 * `titulo` renderiza o cabeçalho padrão com o X. Modais com cabeçalho muito
 * próprio (ex.: detalhe do agendamento) podem omitir e desenhar o seu, mas o
 * painel e o comportamento continuam daqui.
 */
const TAMANHOS = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const

export function Modal({
  onClose,
  titulo,
  tamanho = 'sm',
  children,
}: {
  onClose: () => void
  titulo?: ReactNode
  tamanho?: keyof typeof TAMANHOS
  children: ReactNode
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', aoTeclar)
    // Trava o scroll da página atrás — restaura o valor anterior ao fechar,
    // para modal sobre modal não destravar cedo demais.
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = anterior
    }
  }, [onClose])

  return (
    <div
      className="modal-veu fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`modal-painel bg-surface rounded-2xl border border-border shadow-xl w-full ${TAMANHOS[tamanho]} max-h-[90vh] overflow-y-auto p-5 space-y-4`}
      >
        {titulo && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
