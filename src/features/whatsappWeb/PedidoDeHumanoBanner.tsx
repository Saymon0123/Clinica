import { useState } from 'react'
import { Check, Hand, MessageCircle } from 'lucide-react'
import { formatarTelefone } from '../../lib/telefone'
import type { PedidoDeHumano } from './usePedidosDeHumano'

/**
 * O alerta global de "cliente pedindo você": nome, o que ele quer e o atalho
 * para responder no /web — visível em qualquer tela do CRM.
 *
 * "Responder" abre o /web já na conversa certa. Quando a coexistência da Meta
 * chegar (número de volta no aplicativo do celular), este botão passa a abrir
 * o wa.me do cliente e o /web se aposenta.
 */
export function PedidoDeHumanoBanner({
  pedidos,
  onResolver,
}: {
  pedidos: PedidoDeHumano[]
  onResolver: (id: string) => Promise<boolean>
}) {
  const [resolvendo, setResolvendo] = useState<string | null>(null)

  if (pedidos.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
      {pedidos.map((p) => (
        <div
          key={p.id}
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
              <div className="flex items-center gap-3 mt-2">
                <a
                  href={`/web?conversa=${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 btn-primary rounded px-2.5 py-1 text-xs font-medium"
                >
                  <MessageCircle size={13} />
                  Responder
                </a>
                <button
                  onClick={async () => {
                    setResolvendo(p.id)
                    await onResolver(p.id)
                    setResolvendo(null)
                  }}
                  disabled={resolvendo === p.id}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Check size={13} />
                  {resolvendo === p.id ? 'Resolvendo...' : 'Resolvido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
