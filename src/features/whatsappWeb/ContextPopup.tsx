import { Sparkles, X } from 'lucide-react'

/**
 * Resumo que o agente de IA escreveu ao passar a conversa para o dono.
 * Aparece quando ele abre uma conversa da aba "Solicitou falar com o dono".
 */
export function ContextPopup({
  contactName,
  resumo,
  onClose,
}: {
  contactName: string
  resumo: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border shadow-sm w-full max-w-sm p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-soft text-primary-soft-foreground shrink-0">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">Resumo da conversa</h2>
              <p className="text-xs text-muted-foreground">{contactName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{resumo}</p>

        <p className="text-xs text-muted-foreground">
          Resumo escrito pelo atendimento automático no momento em que o cliente pediu para falar com você.
        </p>

        <button onClick={onClose} className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium">
          Entendi, ver conversa
        </button>
      </div>
    </div>
  )
}
