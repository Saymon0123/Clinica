import { useState } from 'react'
import { Check, Clock, Hand, MessageCircle } from 'lucide-react'
import { formatarTelefone } from '../../lib/telefone'
import { toast } from '../../components/Toast'
import { adiar, estaAdiado, lerAdiados } from './adiados'
import type { PedidoDeHumano } from './usePedidosDeHumano'

/** Acima disto a pilha vira parede: o resto é resumido numa linha. */
const MAXIMO_NA_TELA = 3

/**
 * O alerta global de "cliente pedindo você": nome, o que ele quer e o atalho
 * para responder no /web — visível em qualquer tela do CRM.
 *
 * Sem posição própria: quem o coloca na tela é a `PilhaDeAvisos` do layout,
 * abaixo do cabeçalho no celular (achado 35 da revisão de 01/09). Três
 * saídas: "Responder" abre o /web na conversa certa; "Resolvido" devolve o
 * cliente ao agente (grava no banco); "Depois" só esconde aqui, nesta aba, e
 * volta sozinho se o cliente mandar outra mensagem — antes não havia como
 * tirar o aviso da frente sem gravar uma mentira.
 *
 * Quando a coexistência da Meta chegar (número de volta no aplicativo do
 * celular), "Responder" passa a abrir o wa.me do cliente e o /web se aposenta.
 */
export function PedidoDeHumanoBanner({
  pedidos,
  onResolver,
}: {
  pedidos: PedidoDeHumano[]
  onResolver: (id: string) => Promise<boolean>
}) {
  const [resolvendo, setResolvendo] = useState<string | null>(null)
  const [adiados, setAdiados] = useState(lerAdiados)

  const abertos = pedidos.filter((p) => !estaAdiado(adiados, p.id, p.last_message_at))
  if (abertos.length === 0) return null

  const visiveis = abertos.slice(0, MAXIMO_NA_TELA)
  const escondidos = abertos.length - visiveis.length

  return (
    <>
      {visiveis.map((p) => (
        <div
          key={p.id}
          role="status"
          className="bg-surface border border-warning/50 rounded-xl shadow-lg p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-warning-soft text-warning flex items-center justify-center shrink-0">
              <Hand size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {p.contact_name ?? formatarTelefone(p.contact_phone)} quer falar com você
              </div>
              {(p.resumo_contexto || p.last_message_preview) && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3">
                  {p.resumo_contexto ?? p.last_message_preview}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <a
                  href={`/web?conversa=${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 btn-primary rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <MessageCircle size={14} />
                  Responder
                </a>
                <button
                  onClick={async () => {
                    setResolvendo(p.id)
                    const ok = await onResolver(p.id)
                    // A falha tem de aparecer: sem isto o pedido continuava
                    // no banner sem explicação, e o dono clicava de novo
                    // achando que não tinha pegado.
                    toast(
                      ok
                        ? 'Pedido resolvido. O agente volta a responder este cliente.'
                        : 'Não foi possível devolver a conversa ao agente. Tente de novo.',
                    )
                    setResolvendo(null)
                  }}
                  disabled={resolvendo === p.id}
                  className="inline-flex items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Check size={14} />
                  {resolvendo === p.id ? 'Resolvendo...' : 'Resolvido'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdiados(adiar(adiados, p.id, p.last_message_at))}
                  title="Esconde por enquanto. Volta se o cliente mandar outra mensagem."
                  className="ml-auto inline-flex items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Clock size={14} />
                  Depois
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {escondidos > 0 && (
        <a
          href="/web?tab=precisa_dono"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary text-right pr-1 hover:underline"
        >
          e mais {escondidos} {escondidos === 1 ? 'pessoa esperando' : 'pessoas esperando'}
        </a>
      )}
    </>
  )
}
