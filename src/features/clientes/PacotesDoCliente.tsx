import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Os pacotes pré-pagos do cliente, na ficha.
 *
 * Substituiu o cartão de carimbos em 2026-08-26: barbearia de hoje vende
 * "pague R$120 e ganhe 5 cortes", não carimbo. O saldo vem CONTADO da view
 * `saldo_de_pacotes` (contratado − consumos), nunca de um número guardado —
 * desfazer uma comanda devolve o crédito sozinho.
 */

type LinhaSaldo = {
  pacote_do_cliente_id: string
  pacote: string
  service_id: string
  servico: string
  contratado: number
  consumido: number
  restante: number
  expira_em: string | null
  vencido: boolean
  comprado_em: string
}

function dataBr(iso: string) {
  return iso.slice(0, 10).split('-').reverse().join('/')
}

export function PacotesDoCliente({ clientId }: { clientId: string }) {
  const [linhas, setLinhas] = useState<LinhaSaldo[]>([])
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let ativo = true
    supabase
      .from('saldo_de_pacotes')
      .select('*')
      .eq('client_id', clientId)
      .order('comprado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          console.error('Erro ao carregar os pacotes do cliente:', error)
          setErro(true)
        } else {
          setLinhas((data ?? []) as LinhaSaldo[])
        }
        setCarregado(true)
      })
    return () => {
      ativo = false
    }
  }, [clientId])

  if (!carregado) return null
  if (erro) {
    return (
      <p className="text-sm text-danger">
        Não foi possível carregar os pacotes. Feche e abra a ficha de novo.
      </p>
    )
  }
  if (linhas.length === 0) return null

  // Agrupa por compra: um cartão por pacote comprado, com as linhas de serviço.
  const porCompra = new Map<string, LinhaSaldo[]>()
  for (const l of linhas) {
    const grupo = porCompra.get(l.pacote_do_cliente_id) ?? []
    grupo.push(l)
    porCompra.set(l.pacote_do_cliente_id, grupo)
  }

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <Package size={14} />
        Pacotes
      </h3>
      <div className="space-y-2">
        {[...porCompra.entries()].map(([id, grupo]) => {
          const cab = grupo[0]
          const esgotado = grupo.every((g) => g.restante === 0)
          return (
            <div
              key={id}
              className={`rounded-lg border p-3 space-y-2 ${
                cab.vencido || esgotado ? 'border-border opacity-70' : 'border-primary/40 bg-primary-soft/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground truncate">{cab.pacote}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {cab.vencido
                    ? `venceu ${dataBr(cab.expira_em!)}`
                    : esgotado
                      ? 'concluído'
                      : cab.expira_em
                        ? `vence ${dataBr(cab.expira_em)}`
                        : 'sem validade'}
                </span>
              </div>
              {grupo.map((g) => (
                <div key={g.service_id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground">{g.servico}</span>
                    <span className="text-muted-foreground">
                      restam {g.restante} de {g.contratado}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(g.consumido / g.contratado) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
