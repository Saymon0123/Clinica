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

export const MENSAGEM_DESCARTAR = 'Descartar o que você preencheu? O que estiver aqui se perde.'

export function Modal({
  onClose,
  titulo,
  tamanho = 'sm',
  bloquearFechamento = false,
  confirmarFechamento = false,
  children,
}: {
  onClose: () => void
  titulo?: ReactNode
  tamanho?: keyof typeof TAMANHOS
  /**
   * Enquanto salva, o modal não fecha por véu, Esc nem X (achado 32 da revisão
   * de 01/09): fechar no meio de um salvamento deixava a tela sem resposta e o
   * dono clicando de novo — e a comanda saía duas vezes.
   */
  bloquearFechamento?: boolean
  /**
   * Há trabalho preenchido: véu, Esc e X perguntam antes de descartar. `true`
   * usa a frase padrão; uma string troca a frase. O botão "Cancelar" de cada
   * formulário NÃO passa por aqui — é escolha explícita, não toque acidental.
   */
  confirmarFechamento?: boolean | string
  children: ReactNode
}) {
  // Um caminho só para os três jeitos de fechar sem escolher. Tocar fora de
  // uma comanda meio preenchida jogava tudo fora sem perguntar — e no celular
  // o véu fica a um polegar de distância de qualquer campo.
  const fecharComCuidado = () => {
    if (bloquearFechamento) return
    if (confirmarFechamento) {
      const mensagem = typeof confirmarFechamento === 'string' ? confirmarFechamento : MENSAGEM_DESCARTAR
      if (!window.confirm(mensagem)) return
    }
    onClose()
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharComCuidado()
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
    // `fecharComCuidado` muda a cada render de propósito (lê as props atuais);
    // o listener é rearmado quando qualquer uma delas muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, bloquearFechamento, confirmarFechamento])

  return (
    // No celular o painel encosta no topo, não no centro: com o teclado aberto,
    // um modal centralizado fica metade escondido atrás dele; `dvh`, e não
    // `vh`, para a barra do navegador não roubar o rodapé do painel.
    <div
      className="modal-veu fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4"
      onClick={fecharComCuidado}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-busy={bloquearFechamento || undefined}
        onClick={(e) => e.stopPropagation()}
        className={`modal-painel bg-surface rounded-2xl border border-border shadow-xl w-full ${TAMANHOS[tamanho]} max-h-[90dvh] overflow-y-auto p-5 space-y-4`}
      >
        {titulo && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
            <button
              onClick={fecharComCuidado}
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
