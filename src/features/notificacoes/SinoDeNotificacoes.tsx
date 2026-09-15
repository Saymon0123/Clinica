import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, CalendarClock, CalendarPlus, CalendarX, Inbox } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useNotificacoesDoShell } from './NotificacoesContext'
import { rotuloDaNotificacao, tempoRelativo, type Notificacao } from './notificacoes'
import { SkeletonLinhas } from '../../components/Skeleton'
import { ErroInline } from '../../components/ErroInline'

const ICONE = {
  novo_horario: CalendarPlus,
  cancelou: CalendarX,
  remarcou: CalendarClock,
} as const

const COR = {
  novo_horario: 'bg-primary-soft text-primary-soft-foreground',
  cancelou: 'bg-danger-soft text-danger',
  remarcou: 'bg-warning-soft text-warning',
} as const

function Item({ n, nova }: { n: Notificacao; nova: boolean }) {
  const Icone = ICONE[n.tipo] ?? CalendarPlus
  const { titulo, detalhe } = rotuloDaNotificacao(n)
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <span
        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${COR[n.tipo] ?? COR.novo_horario}`}
      >
        <Icone size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground leading-snug">{titulo}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{detalhe}</span>
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {tempoRelativo(n.evento_em)}
        </span>
        {/* O pontinho marca o que chegou depois da última abertura DESTA
            pessoa — abre-se o painel e ele ainda mostra o que era novo. */}
        {nova && <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />}
      </span>
    </li>
  )
}

/**
 * O sino: o aviso que passou continua legível.
 *
 * O cartão de "novo agendamento" vive 15 segundos; o de cancelamento mora só
 * na Agenda. O que chegou enquanto o dono cortava cabelo simplesmente sumia
 * (pedido de 14/09). Aqui ficam os últimos 7 dias — a mesma janela do aviso de
 * cancelamento — vindos da view `notificacoes_do_salao`, que é DERIVADA da
 * agenda: nada pode constar no sino e não existir na grade.
 *
 * O contador é por pessoa (`notificacoes_vistas`): o gerente abrir o dele não
 * zera o do dono. E o barbeiro só vê os horários dele — é a RLS de
 * `appointments` atravessando a view, não um filtro daqui.
 *
 * Mesmo desenho do ProfileMenu: dropdown no desktop, folha inferior no
 * celular; Esc e toque fora fecham; `direcao="cima"` para viver no rodapé da
 * sidebar.
 */
export function SinoDeNotificacoes({ direcao = 'baixo' }: { direcao?: 'baixo' | 'cima' } = {}) {
  const { salonId } = useSalon()
  // O estado vem do provider do AppLayout: o sino aparece DUAS vezes (celular
  // e sidebar), e cada um chamando o hook abria dois canais com o mesmo nome —
  // o segundo `subscribe()` derrubava o app (Sentry REACT-NATIVE-7).
  const { notificacoes, naoVistas, carregando, erro, recarregar, marcarVistas } =
    useNotificacoesDoShell()
  const [aberto, setAberto] = useState(false)
  // O marco de ANTES desta abertura: é ele que decide quais itens ganham o
  // pontinho, já que abrir o painel grava um marco novo na mesma hora.
  const [marcoAnterior, setMarcoAnterior] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Fecha ao trocar de tela, como os outros menus flutuantes.
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

  // Sem barbearia escolhida não há o que notificar (dono de rede no painel).
  if (!salonId) return null

  async function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    setAberto(true)
    // Abrir É ler: o badge zera agora, e o pontinho fica com o marco antigo.
    setMarcoAnterior(await marcarVistas())
  }

  const ehNova = (n: Notificacao) =>
    !marcoAnterior || new Date(n.evento_em).getTime() > new Date(marcoAnterior).getTime()

  const conteudo = (
    <>
      <div className="px-3 py-2.5 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Notificações</h2>
        <p className="text-[11px] text-muted-foreground">
          O que os clientes fizeram sozinhos nos últimos 7 dias
        </p>
      </div>

      {carregando && notificacoes.length === 0 ? (
        <div className="p-3">
          <SkeletonLinhas />
        </div>
      ) : erro && notificacoes.length === 0 ? (
        <div className="p-3 space-y-2">
          <ErroInline>Não foi possível carregar as notificações.</ErroInline>
          <button onClick={() => recarregar()} className="btn-chip">
            Tentar de novo
          </button>
        </div>
      ) : notificacoes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Inbox size={28} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground max-w-[16rem]">
            Nada por enquanto. Quando um cliente marcar, mudar ou cancelar um horário sozinho,
            fica registrado aqui por 7 dias.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-y-auto">
          {notificacoes.map((n) => (
            <Item key={n.chave} n={n} nova={ehNova(n)} />
          ))}
        </ul>
      )}

      <div className="px-3 py-2 border-t border-border">
        <Link
          to="/"
          onClick={() => setAberto(false)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Abrir a agenda
        </Link>
      </div>
    </>
  )

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={naoVistas > 0 ? `Notificações, ${naoVistas} não vistas` : 'Notificações'}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        <Bell size={18} />
        {naoVistas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-danger-foreground text-[11px] font-semibold flex items-center justify-center">
            {naoVistas > 9 ? '9+' : naoVistas}
          </span>
        )}
      </button>

      {/* Celular: folha inferior, o mesmo gesto do menu do perfil. */}
      {aberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setAberto(false)}
        >
          <div
            role="dialog"
            aria-label="Notificações"
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-surface rounded-t-2xl border-t border-border pb-[env(safe-area-inset-bottom)] max-h-[80vh] flex flex-col motion-safe:animate-[folha-sobe_200ms_ease-out]"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-border-strong my-2 shrink-0" />
            {conteudo}
          </div>
        </div>
      )}

      {/* Desktop: dropdown ancorado no sino. */}
      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          className={`hidden md:flex flex-col absolute right-0 md:right-auto md:left-0 ${
            direcao === 'cima' ? 'bottom-full mb-1' : 'mt-1'
          } w-80 max-w-[calc(100vw-1.5rem)] z-40 bg-surface border border-border rounded-lg shadow-lg max-h-[70vh]`}
        >
          {conteudo}
        </div>
      )}
    </div>
  )
}
