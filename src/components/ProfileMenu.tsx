import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, ChevronsUpDown, LayoutDashboard, LogOut, Store } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useSalon } from '../features/auth/useSalon'

const LABEL_PAPEL: Record<string, string> = {
  owner: 'Dono',
  gerente: 'Gerente',
  barbeiro: 'Barbeiro',
}

/**
 * Menu do perfil: troca de unidade, atalho para o painel da rede e sair.
 *
 * Fica no topo em qualquer tamanho de tela — a versão anterior vivia só
 * dentro da sidebar de desktop e sumia no celular.
 */
export function ProfileMenu() {
  const { user, signOut } = useAuth()
  const { unidades, salonId, salonName, role, isOwner, selecionarUnidade } = useSalon()
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
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

  const inicial = (salonName ?? user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Perfil e unidades"
        className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-[13px] shrink-0">
          {inicial}
        </span>
        <span className="hidden sm:flex flex-col items-start min-w-0 max-w-[9rem]">
          <span className="text-[13px] font-medium leading-none mb-0.5 text-foreground truncate w-full text-left">
            {salonName ?? 'Sem unidade'}
          </span>
          <span className="text-[11px] text-muted-foreground leading-none">
            {role ? LABEL_PAPEL[role] : '—'}
          </span>
        </span>
        <ChevronsUpDown size={14} className="text-muted-foreground shrink-0" />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-72 z-40 bg-surface border border-border rounded-lg shadow-lg py-1 max-h-[70vh] overflow-y-auto"
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>

          {isOwner && (
            <>
              <button
                onClick={() => {
                  navigate('/rede')
                  setAberto(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-surface-2"
              >
                <LayoutDashboard size={15} className="text-muted-foreground" />
                Painel da rede
              </button>
              <div className="border-t border-border my-1" />
            </>
          )}

          {unidades.length > 1 && (
            <>
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Trocar de barbearia
              </p>
              {unidades.map((u) => (
                <button
                  key={u.salonId}
                  role="menuitem"
                  onClick={() => {
                    selecionarUnidade(u.salonId)
                    setAberto(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="w-4 shrink-0">
                    {u.salonId === salonId && <Check size={14} className="text-primary" />}
                  </span>
                  {u.organizationId ? (
                    <Building2 size={14} className="text-muted-foreground shrink-0" />
                  ) : (
                    <Store size={14} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-foreground truncate">{u.nome}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {LABEL_PAPEL[u.role] ?? u.role}
                      {!u.ativo && ' · desativada'}
                    </span>
                  </span>
                </button>
              ))}
              <div className="border-t border-border my-1" />
            </>
          )}

          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-surface-2"
          >
            <LogOut size={15} className="text-muted-foreground" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
