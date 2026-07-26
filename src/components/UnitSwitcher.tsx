import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Store } from 'lucide-react'
import { useSalon } from '../features/auth/useSalon'

/**
 * Troca a unidade atual. Só aparece para quem tem vínculo com mais de uma —
 * numa barbearia única ele seria só ruído na tela.
 */
export function UnitSwitcher() {
  const { unidades, salonId, salonName, selecionarUnidade } = useSalon()
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    function aoApertarEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoApertarEsc)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoApertarEsc)
    }
  }, [aberto])

  if (unidades.length <= 1) return null

  return (
    <div ref={containerRef} className="relative px-3 pb-2">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border text-left hover:bg-surface-2 transition-colors"
      >
        <Store size={15} className="text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-[13px] font-medium text-foreground truncate">
          {salonName ?? 'Selecione a unidade'}
        </span>
        <ChevronsUpDown size={14} className="text-muted-foreground shrink-0" />
      </button>

      {aberto && (
        <div
          role="listbox"
          className="absolute left-3 right-3 mt-1 z-30 bg-surface border border-border rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto"
        >
          {unidades.map((u) => (
            <button
              key={u.salonId}
              role="option"
              aria-selected={u.salonId === salonId}
              onClick={() => {
                selecionarUnidade(u.salonId)
                setAberto(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="w-4 shrink-0">
                {u.salonId === salonId && <Check size={14} className="text-primary" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-foreground truncate">{u.nome}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {u.role === 'owner' ? 'Dono' : u.role === 'gerente' ? 'Gerente' : 'Barbeiro'}
                  {!u.ativo && ' · desativada'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
