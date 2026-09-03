import { useEffect, useState } from 'react'
import { MarcaClubCut } from './MarcaClubCut'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  Calendar,
  Users,
  Wallet,
  Link2,
  Globe,
  Tag,
  Settings,
  UsersRound,
  Building2,
  CreditCard,
  MoreHorizontal,
} from 'lucide-react'
import { PilhaDeAvisos } from './PilhaDeAvisos'
import { ProfileMenu } from './ProfileMenu'
import { supabase } from '../lib/supabase'
import { useSalon } from '../features/auth/useSalon'
import { useAppointmentAlerts } from '../features/agenda/useAppointmentAlerts'
import { AppointmentAlertBanner } from '../features/agenda/AppointmentAlertBanner'
import { usePendingConversations } from '../features/whatsappWeb/usePendingConversations'
import { usePedidosDeHumano } from '../features/whatsappWeb/usePedidosDeHumano'
import { PedidoDeHumanoBanner } from '../features/whatsappWeb/PedidoDeHumanoBanner'
import { Toasts } from './Toast'
import { useAssinatura } from '../features/assinatura/useAssinatura'
import { AvisoAssinatura } from '../features/assinatura/AvisoAssinatura'
import { AcessoBloqueado } from '../features/assinatura/AcessoBloqueado'
import { CriarBarbeariaPage } from '../features/onboarding/CriarBarbeariaPage'
import { ThemeToggle } from './ThemeToggle'

type NavItem = {
  to: string
  label: string
  icon: typeof Calendar
  somenteGestor?: boolean
  somenteDono?: boolean
  /** Continua acessível mesmo sem barbearia escolhida. */
  semUnidade?: boolean
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Agenda', icon: Calendar },
      { to: '/financeiro', label: 'Financeiro', icon: Wallet },
    ],
  },
  {
    title: 'Gestão',
    items: [
      // Sem `somenteGestor`: o barbeiro cadastra cliente novo na cadeira, e a
      // policy `clients: membros cadastram` já permite isso. O que ele enxerga
      // depois é limitado pelo RLS aos que ele criou ou atendeu — o item ficava
      // escondido, mas a rota respondia, então quem soubesse a URL entrava.
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/catalogo', label: 'Catálogo', icon: Tag },
      { to: '/equipe', label: 'Equipe', icon: UsersRound, somenteGestor: true },
      { to: '/rede', label: 'Rede', icon: Building2, somenteDono: true, semUnidade: true },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, somenteGestor: true },
      { to: '/assinatura', label: 'Assinatura', icon: CreditCard, somenteGestor: true },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { to: '/conexao', label: 'Conexão', icon: Link2, somenteGestor: true },
    ],
  },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  // Item ativo em pílula preenchida no verde da marca (referência CheckinOs):
  // um único ponto de cor forte na sidebar, o resto fica quieto.
  return `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium tracking-wide transition-all duration-200 ${
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
  }`
}

export function AppLayout() {
  const {
    salonId,
    salonName,
    isManager,
    isOwner,
    isNetwork,
    loading,
    erroAoCarregar,
    unidades,
    recarregarUnidades,
  } = useSalon()
  const location = useLocation()
  const { alerts, dismiss } = useAppointmentAlerts(salonId)
  const { hasPending } = usePendingConversations(isManager ? salonId : null)
  const { pedidos, resolver } = usePedidosDeHumano(isManager ? salonId : null)
  // Carregado para todos, porque o **bloqueio** vale para todos: se o acesso
  // venceu, o barbeiro também não usa o CRM. O que é só do gestor é o **aviso**
  // de vencimento — avisar o barbeiro de uma cobrança que não é dele geraria
  // preocupação sem ação possível.
  const { assinatura } = useAssinatura(salonId)

  // "Rede" e "Equipe da rede" são exclusivas do dono de mais de uma unidade.
  // Gerente e barbeiro nunca veem, mesmo administrando a unidade inteira.
  const podeVerRede = isOwner && isNetwork

  // Barbeiro fica só com Agenda, Financeiro e Catálogo (o banco também
  // bloqueia o resto). Enquanto o dono não escolher uma barbearia, o menu
  // mostra apenas as telas da rede — as outras não teriam salon_id.
  const gruposVisiveis = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.somenteGestor || isManager) &&
        (!i.somenteDono || podeVerRede) &&
        (i.semUnidade || !!salonId),
    ),
  })).filter((g) => g.items.length > 0)
  const itensVisiveis = gruposVisiveis.flatMap((g) => g.items)

  /**
   * A barra inferior do celular só comporta cinco itens.
   *
   * Dono de rede tem dez itens de menu. Dividindo a largura de um celular por
   * dez sobram ~37px por item — menos que a palavra "Configurações" ocupa, e
   * era isso que embolava a barra. O resto vai para uma folha "Mais".
   *
   * Com cinco ou menos, todos cabem e o "Mais" não aparece: é o caso do
   * barbeiro, que vê três telas.
   */
  const [maisAberto, setMaisAberto] = useState(false)

  // Fecha ao trocar de tela: sem isto a folha fica por cima da pagina nova.
  useEffect(() => {
    setMaisAberto(false)
  }, [location.pathname])

  const CABEM_NA_BARRA = 5
  const temMais = itensVisiveis.length > CABEM_NA_BARRA
  const itensDaBarra = temMais ? itensVisiveis.slice(0, CABEM_NA_BARRA - 1) : itensVisiveis
  const itensDoMais = temMais ? itensVisiveis.slice(CABEM_NA_BARRA - 1) : []

  // Conta sem barbearia nenhuma é o estado normal de quem acabou de se
  // cadastrar — o segundo passo do cadastro aberto. Antes disto, seis telas
  // repetiam "fale com o administrador do sistema", que era um beco: quem
  // caísse ali não tinha o que fazer.
  //
  // `unidades.length` e não `salonId`: dono de rede sem unidade escolhida
  // também tem `salonId` nulo, e mandá-lo criar barbearia seria absurdo.
  // Falha ao carregar NÃO é "não tem barbearia". Uma queda de rede mandava o
  // dono para a tela de criar barbearia — parecendo que a dele havia sumido —
  // e ele podia criar uma segunda por engano (achado 4 da revisão de 01/09).
  if (!loading && erroAoCarregar) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-lg font-semibold text-foreground">
            Não foi possível carregar sua barbearia
          </h1>
          <p className="text-sm text-muted-foreground">
            Isso costuma ser conexão. Sua barbearia e seus dados estão salvos — nada foi perdido.
          </p>
          <button
            onClick={() => void recarregarUnidades()}
            className="w-full btn-primary rounded-lg px-3 py-2.5 text-sm font-semibold"
          >
            Tentar de novo
          </button>
          <button
            onClick={() => void supabase.auth.signOut()}
            className="w-full btn-ghost rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            Sair desta conta
          </button>
        </div>
      </div>
    )
  }

  if (!loading && unidades.length === 0) {
    return <CriarBarbeariaPage />
  }

  // Dono de rede entra pelo painel: sem barbearia escolhida, as demais telas
  // não teriam o que carregar.
  if (!loading && !salonId && podeVerRede && !location.pathname.startsWith('/rede')) {
    return <Navigate to="/rede" replace />
  }

  // Acesso vencido bloqueia o CRM inteiro, menos a própria tela de assinatura —
  // trancar o caminho de regularizar seria beco sem saída.
  //
  // Barbearia cadastrada antes do controle de assinatura tem `assinatura` nula
  // e **não é bloqueada**: quem já usava não pode ser trancado do lado de fora
  // por uma funcionalidade que chegou depois.
  if (assinatura?.expirada && location.pathname !== '/assinatura') {
    return <AcessoBloqueado assinatura={assinatura} />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Topbar (mobile only) */}
      {/* z-40: o header cria contexto de empilhamento, e a folha do perfil
          (dentro dele) precisa vencer o botão do tour (z-30, fora dele). */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border sticky top-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground shrink-0">
            <MarcaClubCut size={16} />
          </span>
          <span className="font-semibold text-foreground truncate">{salonName ?? 'Rede'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </header>

      {/* Sidebar (desktop only) */}
      <aside className="hidden md:flex w-60 border-r border-sidebar-border bg-sidebar flex-col shrink-0">
        {/* Marca no topo, como um produto assina (referência CheckinOs). */}
        <div className="px-4 pt-6 pb-5 flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
            <MarcaClubCut size={16} />
          </span>
          <span className="text-base font-bold tracking-tight text-foreground">Club Cut</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          {gruposVisiveis.map((group) => (
            <div key={group.title}>
              <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Perfil no rodapé da sidebar (leva B, referência): quem sou eu e em
            qual unidade estou fecham a coluna, como o usuário da referência.
            Mesmo ProfileMenu de sempre — só mudou de lugar e abre para cima. */}
        <div className="px-3 py-3 border-t border-sidebar-border flex items-center justify-between gap-2">
          <ProfileMenu direcao="cima" />
          <ThemeToggle />
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 pb-20 md:pb-6 w-full">
        <AvisoAssinatura assinatura={isManager ? assinatura : null} />
        {/* Largura máxima + centralização (leva 3): sem isto, num monitor
            grande as tabelas esticavam de ponta a ponta e os formulários
            max-w-2xl ficavam grudados na esquerda. 72rem comporta a grade da
            agenda e os 4 cards do Financeiro com folga. */}
        <div className="p-4 md:p-6 w-full max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav (mobile only) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar border-t border-sidebar-border flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {itensDaBarra.map((item) => (
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
            <item.icon size={20} className="shrink-0" />
            {/* `truncate` como rede de segurança: rótulo longo encolhe com
                reticências em vez de quebrar a linha e desalinhar a barra. */}
            <span className="text-[11px] leading-tight max-w-full truncate px-0.5">
              {item.label}
            </span>
          </NavLink>
        ))}

        {temMais && (
          <button
            onClick={() => setMaisAberto(true)}
            aria-label="Mais opções"
            className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 ${
              itensDoMais.some((i) => i.to === location.pathname)
                ? 'text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal size={20} className="shrink-0" />
            <span className="text-[11px] leading-tight">Mais</span>
          </button>
        )}
      </nav>

      {/* Folha "Mais": o que não coube na barra. */}
      {maisAberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setMaisAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-surface rounded-t-2xl border-t border-border p-2 pb-6 max-h-[70vh] overflow-y-auto"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-border-strong my-2" />
            {itensDoMais.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMaisAberto(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                    isActive ? 'text-primary bg-primary-soft' : 'text-foreground hover:bg-surface-2'
                  }`
                }
              >
                <item.icon size={18} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Botão flutuante: abre o espelho do WhatsApp em nova aba (só desktop, só gestor) */}
      {isManager && (
      <button
        onClick={() => window.open('/web', '_blank', 'noopener,noreferrer')}
        className={`hidden md:flex fixed bottom-6 right-4 z-20 items-center gap-2 text-white rounded-full pl-3 pr-4 py-3 shadow-lg transition-colors ${
          hasPending ? 'bg-danger hover:brightness-95 animate-pulse' : 'bg-primary hover:bg-primary-hover'
        }`}
      >
        <Globe size={18} />
        <span className="text-sm font-semibold">WEB</span>
      </button>
      )}

      {/* Uma pilha só para os avisos flutuantes, abaixo do cabeçalho no
          celular (achado 35). O /web não usa o AppLayout, então o alerta
          nunca cobre a própria tela de resposta — lá a conversa pendente já
          fica destacada. */}
      <PilhaDeAvisos>
        <AppointmentAlertBanner alerts={alerts} onDismiss={dismiss} />
        <PedidoDeHumanoBanner pedidos={pedidos} onResolver={resolver} />
      </PilhaDeAvisos>
      <Toasts />
    </div>
  )
}
