import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { calcularPosicao, type Colocacao, type Retangulo } from './posicionar'

export type PassoDoTour = {
  /** Valor do `data-tour` no elemento destacado. */
  ancora: string
  titulo: string
  texto: string
}

/** Sobe junto quando os passos mudarem de verdade, para o tour reaparecer. */
const VERSAO = 1

function chaveDoStorage(chave: string) {
  return `salaocrm:tour:${chave}:v${VERSAO}`
}

function retanguloDe(ancora: string): Retangulo | null {
  const el = document.querySelector(`[data-tour="${ancora}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * Tour de destaque: escurece a tela, recorta o elemento e explica o que ele faz.
 *
 * Duas decisões de robustez, porque tour é do tipo de coisa que quebra em
 * silêncio quando a tela muda:
 *
 * **Âncora por `data-tour`, nunca por classe ou seletor CSS.** Classe do
 * Tailwind muda a cada ajuste visual; o atributo é contrato explícito, e quem
 * for mexer no elemento vê que existe um tour apontando para ele.
 *
 * **Passo sem âncora é pulado, não quebra.** Se o elemento sumiu ou ainda não
 * renderizou, o tour segue para o próximo em vez de travar com um recorte
 * vazio no canto da tela.
 */
export function Tour({ chave, passos }: { chave: string; passos: PassoDoTour[] }) {
  const [indice, setIndice] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<Retangulo | null>(null)
  const [colocacao, setColocacao] = useState<Colocacao | null>(null)
  const balaoRef = useRef<HTMLDivElement>(null)

  const ativo = indice !== null
  const passo = ativo ? passos[indice] : null

  const encerrar = useCallback(() => {
    setIndice(null)
    setAlvo(null)
    try {
      localStorage.setItem(chaveDoStorage(chave), '1')
    } catch {
      // Navegador com storage bloqueado: o tour reaparece, mas nada quebra.
    }
  }, [chave])

  // Primeira visita à tela: abre sozinho. Nas seguintes, só pelo botão de ajuda.
  useEffect(() => {
    if (passos.length === 0) return
    let jaViu = false
    try {
      jaViu = localStorage.getItem(chaveDoStorage(chave)) === '1'
    } catch {
      jaViu = false
    }
    if (!jaViu) {
      // Um quadro de atraso: os elementos precisam existir para serem medidos.
      const t = setTimeout(() => setIndice(0), 400)
      return () => clearTimeout(t)
    }
  }, [chave, passos.length])

  // Mede o alvo e reposiciona. Roda também em scroll e resize porque o
  // recorte é desenhado em coordenadas de viewport.
  useLayoutEffect(() => {
    if (!ativo || !passo) return

    function medir() {
      const r = retanguloDe(passo!.ancora)
      if (!r) {
        // Âncora ausente: pula em vez de travar.
        setIndice((i) => (i === null ? null : i + 1 < passos.length ? i + 1 : null))
        return
      }
      setAlvo(r)
      const balao = balaoRef.current
      setColocacao(
        calcularPosicao(
          r,
          {
            largura: balao?.offsetWidth ?? 320,
            altura: balao?.offsetHeight ?? 150,
          },
          { largura: window.innerWidth, altura: window.innerHeight },
        ),
      )
    }

    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [ativo, passo, passos.length])

  // Esc fecha, como qualquer sobreposição.
  useEffect(() => {
    if (!ativo) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') encerrar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ativo, encerrar])

  function avancar() {
    setIndice((i) => {
      if (i === null) return null
      if (i + 1 < passos.length) return i + 1
      try {
        localStorage.setItem(chaveDoStorage(chave), '1')
      } catch {
        /* storage bloqueado */
      }
      return null
    })
  }

  if (passos.length === 0) return null

  return (
    <>
      {/* Reabrir sempre possível tira o peso de "preciso prestar atenção
          agora" — quem pula não fica sem o conteúdo. */}
      {!ativo && (
        <button
          onClick={() => setIndice(0)}
          aria-label="Ver o tour desta tela"
          title="Ver o tour desta tela"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6 left-4 z-30 w-9 h-9 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-border-strong flex items-center justify-center shadow-sm transition-colors"
        >
          <HelpCircle size={18} />
        </button>
      )}

      {ativo && alvo && passo && (
        <>
          {/* Bloqueia a interação com a tela por baixo. */}
          <div className="fixed inset-0 z-[60]" onClick={encerrar} />

          {/* O recorte: a sombra gigante é o que escurece o resto da tela. */}
          <div
            className="fixed z-[61] rounded-lg pointer-events-none transition-all duration-200"
            style={{
              top: alvo.top - 4,
              left: alvo.left - 4,
              width: alvo.width + 8,
              height: alvo.height + 8,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            }}
          />

          <div
            ref={balaoRef}
            role="dialog"
            aria-label={passo.titulo}
            className="fixed z-[62] w-[320px] max-w-[calc(100vw-24px)] bg-surface border border-border rounded-2xl shadow-xl p-4"
            style={{ top: colocacao?.top ?? 0, left: colocacao?.left ?? 0 }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">{passo.titulo}</h2>
              <button
                onClick={encerrar}
                aria-label="Fechar tour"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{passo.texto}</p>

            <div className="flex items-center justify-between gap-3 mt-4">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {(indice ?? 0) + 1} de {passos.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={encerrar}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Pular
                </button>
                <button
                  onClick={avancar}
                  className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  {(indice ?? 0) + 1 === passos.length ? 'Entendi' : 'Próximo'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
