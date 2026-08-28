import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  Store,
  HelpCircle,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useSalon } from '../features/auth/useSalon'
import { FeedbackModal } from '../features/feedback/FeedbackModal'

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
export function ProfileMenu({ direcao = 'baixo' }: { direcao?: 'baixo' | 'cima' } = {}) {
  const { user, signOut } = useAuth()
  const { unidades, salonId, salonName, role, isOwner, selecionarUnidade } = useSalon()
  const [aberto, setAberto] = useState(false)
  const [feedbackAberto, setFeedbackAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Fecha ao mudar de rota: sem isso o menu fica aberto por cima da tela nova.
  useEffect(() => {
    setAberto(false)
  }, [location.pathname])

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

  /**
   * O miolo do menu, compartilhado entre o dropdown (desktop) e a folha
   * inferior (celular). `folha` engorda o padding para altura de dedo.
   */
  function Conteudo({ folha = false }: { folha?: boolean }) {
    const item = folha
      ? 'w-full flex items-center gap-3 px-3 py-3 text-left text-sm text-foreground rounded-lg hover:bg-surface-2'
      : 'w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-surface-2'
    const icone = folha ? 17 : 15

    return (
      <>
        {isOwner && (
          <>
            {/* Link de verdade (âncora) em vez de navigate() no onClick:
                funciona mesmo se algum handler engolir o clique, e permite
                abrir em nova aba. */}
            <Link to="/rede" onClick={() => setAberto(false)} className={item}>
              <LayoutDashboard size={icone} className="text-muted-foreground" />
              Painel da rede
            </Link>
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
                className={item}
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
                  <span className={`block text-foreground truncate ${folha ? 'text-sm' : 'text-[13px]'}`}>
                    {u.nome}
                  </span>
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

        {/* Ajuda e sugestão moram aqui, e não numa aba: a dúvida e o atrito
            surgem em qualquer tela, e o caminho precisa ser um clique. */}
        <Link to="/ajuda" onClick={() => setAberto(false)} className={item}>
          <HelpCircle size={icone} className="text-muted-foreground" />
          Central de Ajuda
        </Link>

        <button
          onClick={() => {
            setFeedbackAberto(true)
            setAberto(false)
          }}
          className={item}
        >
          <MessageSquarePlus size={icone} className="text-muted-foreground" />
          Enviar sugestão
        </button>

        <div className="border-t border-border my-1" />

        <button onClick={() => signOut()} className={item}>
          <LogOut size={icone} className="text-muted-foreground" />
          Sair
        </button>
      </>
    )
  }

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

      {/* No celular o menu vira FOLHA INFERIOR — o mesmo gesto do botão "Mais"
          da barra: sobe do rodapé, cantos arredondados, alcinha, botões com
          altura de dedo. No desktop segue dropdown ancorado no avatar. */}
      {aberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setAberto(false)}
        >
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-surface rounded-t-2xl border-t border-border px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] max-h-[80vh] overflow-y-auto motion-safe:animate-[folha-sobe_200ms_ease-out]"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-border-strong my-2" />
            <div className="flex items-center gap-3 px-3 py-3 mb-1">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-semibold shrink-0">
                {inicial}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground truncate">
                  {salonName ?? 'Sem unidade'}
                </span>
                <span className="block text-xs text-muted-foreground truncate">{user?.email}</span>
              </span>
            </div>
            <Conteudo folha />
          </div>
        </div>
      )}

      {aberto && (
        <div
          role="menu"
          // Dropdown do desktop. Na sidebar (240px) ancora à esquerda para o
          // menu de 288px não sair da tela. No rodapé da sidebar (leva B),
          // `direcao="cima"` abre o menu para cima, senão ele estoura a tela.
          className={`hidden md:block absolute right-0 md:right-auto md:left-0 ${
            direcao === 'cima' ? 'bottom-full mb-1' : 'mt-1'
          } w-72 max-w-[calc(100vw-1.5rem)] z-40 bg-surface border border-border rounded-lg shadow-lg py-1 max-h-[70vh] overflow-y-auto`}
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Conteudo />
        </div>
      )}

      {feedbackAberto && <FeedbackModal onClose={() => setFeedbackAberto(false)} />}
    </div>
  )
}
