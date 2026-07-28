import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'

export type ItemNav = { to: string; label: string; icon: LucideIcon }

/**
 * Quantos cabem na barra flutuante.
 *
 * Itens inativos ocupam só o ícone, então cabem mais do que na barra
 * antiga, que reservava espaço para o rótulo de todos.
 */
const MAX_NA_BARRA = 5

/**
 * Navegação inferior do celular: barra flutuante com o item ativo em pílula.
 *
 * O rótulo aparece apenas na tela atual — é o que permite espremer menos e
 * ainda assim dizer onde o usuário está. O que não couber vai para uma
 * gaveta, senão o menu voltaria a estourar quando telas novas entrarem.
 */
export function BottomNav({ itens }: { itens: ItemNav[] }) {
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setGavetaAberta(false)
  }, [location.pathname])

  const cabemTodos = itens.length <= MAX_NA_BARRA + 1
  const naBarra = cabemTodos ? itens : itens.slice(0, MAX_NA_BARRA)
  const naGaveta = cabemTodos ? [] : itens.slice(MAX_NA_BARRA)
  const algumNaGavetaAtivo = naGaveta.some((i) => location.pathname === i.to)

  return (
    <>
      {gavetaAberta && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px]"
          onClick={() => setGavetaAberta(false)}
          aria-hidden
        />
      )}

      {gavetaAberta && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-border rounded-t-3xl p-5 shadow-2xl"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          {/* Alça: sinaliza que o painel é descartável, como em app nativo. */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-foreground">Mais opções</span>
            <button
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar"
              className="p-1 rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {naGaveta.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-2 rounded-2xl px-2 py-4 text-center transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted-foreground active:bg-border'
                  }`
                }
              >
                <item.icon size={22} />
                <span className="text-[11px] font-medium leading-tight">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-10 px-3 pointer-events-none"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-auto flex items-center justify-between gap-1 rounded-full border border-border bg-sidebar/95 px-2 py-2 shadow-lg backdrop-blur">
          {naBarra.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground px-3 py-2'
                    : 'text-muted-foreground px-2.5 py-2 active:bg-surface-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className="shrink-0" />
                  {isActive && (
                    <span className="text-[12px] font-semibold whitespace-nowrap">{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}

          {naGaveta.length > 0 && (
            <button
              onClick={() => setGavetaAberta((v) => !v)}
              aria-label="Mais opções"
              aria-expanded={gavetaAberta}
              className={`flex items-center gap-1.5 rounded-full transition-all duration-200 ${
                gavetaAberta || algumNaGavetaAtivo
                  ? 'bg-primary text-primary-foreground px-3 py-2'
                  : 'text-muted-foreground px-2.5 py-2 active:bg-surface-2'
              }`}
            >
              <MoreHorizontal size={20} className="shrink-0" />
              {(gavetaAberta || algumNaGavetaAtivo) && (
                <span className="text-[12px] font-semibold whitespace-nowrap">Mais</span>
              )}
            </button>
          )}
        </div>
      </nav>
    </>
  )
}
