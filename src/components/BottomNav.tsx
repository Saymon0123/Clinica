import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'

export type ItemNav = { to: string; label: string; icon: LucideIcon }

/** Quantos cabem confortavelmente na barra de um celular. */
const MAX_NA_BARRA = 4

/**
 * Navegação inferior do celular.
 *
 * A barra comporta bem até 5 itens. Como o menu cresceu (rede, equipe da
 * rede, assinatura), os primeiros ficam fixos e o resto vai para uma gaveta
 * — espremer tudo deixava os rótulos colados e quebrando em duas linhas.
 */
export function BottomNav({ itens }: { itens: ItemNav[] }) {
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const location = useLocation()

  // Trocar de tela fecha a gaveta sozinha.
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
          className="md:hidden fixed inset-0 z-20 bg-black/40"
          onClick={() => setGavetaAberta(false)}
          aria-hidden
        />
      )}

      {gavetaAberta && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-border rounded-t-2xl p-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Mais opções</span>
            <button
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar"
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {naGaveta.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 text-center ${
                    isActive
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'bg-surface-2 text-muted-foreground'
                  }`
                }
              >
                <item.icon size={20} />
                <span className="text-[11px] leading-tight">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-sidebar-border flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {naBarra.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <item.icon size={20} />
            <span className="text-[10px] leading-tight truncate max-w-full px-0.5">{item.label}</span>
          </NavLink>
        ))}

        {naGaveta.length > 0 && (
          <button
            onClick={() => setGavetaAberta((v) => !v)}
            aria-label="Mais opções"
            aria-expanded={gavetaAberta}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 ${
              gavetaAberta || algumNaGavetaAtivo ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] leading-tight">Mais</span>
          </button>
        )}
      </nav>
    </>
  )
}
