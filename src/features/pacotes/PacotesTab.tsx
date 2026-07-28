import { Package, Plus, Power } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ServiceItem } from '../catalogo/types'
import type { Pacote } from './usePackagesData'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PacotesTab({
  pacotes,
  servicos,
  erro,
  isManager,
  onNovo,
  onEditar,
  onAlterado,
}: {
  pacotes: Pacote[]
  servicos: ServiceItem[]
  erro: string | null
  isManager: boolean
  onNovo: () => void
  onEditar: (p: Pacote) => void
  onAlterado: () => void
}) {
  const nomeDoServico = new Map(servicos.map((s) => [s.id, s.nome]))

  async function alternarAtivo(p: Pacote) {
    await supabase.from('packages').update({ ativo: !p.ativo }).eq('id', p.id)
    onAlterado()
  }

  return (
    <div>
      {isManager && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onNovo}
            className="flex items-center gap-2 btn-primary rounded px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            Novo pacote
          </button>
        </div>
      )}

      {erro && <p className="text-sm text-danger mb-3">{erro}</p>}

      {pacotes.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <Package size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-foreground font-medium">Nenhum pacote ainda</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Pacote é o cliente pagar vários atendimentos de uma vez, com desconto. O dinheiro entra
            agora e ele volta para usar o que já comprou.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pacotes.map((p) => {
            const totalCreditos = p.itens.reduce((s, i) => s + i.quantidade, 0)
            const valorAvulso = p.itens.reduce((soma, i) => {
              const s = servicos.find((x) => x.id === i.serviceId)
              return soma + (s ? s.preco * i.quantidade : 0)
            }, 0)
            const desconto = valorAvulso > 0 ? ((valorAvulso - p.preco) / valorAvulso) * 100 : 0

            return (
              <div
                key={p.id}
                className={`bg-surface border rounded-xl p-4 ${
                  p.ativo ? 'border-border' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{p.nome}</h3>
                      {!p.ativo && (
                        <span className="text-[11px] rounded-full bg-surface-2 text-muted-foreground px-2 py-0.5 shrink-0">
                          Inativo
                        </span>
                      )}
                    </div>
                    {p.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>
                    )}
                  </div>
                  <span className="text-base font-semibold text-foreground shrink-0">
                    {moeda(p.preco)}
                  </span>
                </div>

                <ul className="mt-3 space-y-1">
                  {p.itens.map((i) => (
                    <li key={i.serviceId} className="text-sm text-foreground">
                      {i.quantidade}× {nomeDoServico.get(i.serviceId) ?? 'Serviço removido'}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {desconto > 0 && (
                    <span className="text-success font-medium">{desconto.toFixed(0)}% off</span>
                  )}
                  <span>
                    {p.validadeDias == null ? 'Sem validade' : `Vence em ${p.validadeDias} dias`}
                  </span>
                  {p.valeNaRede && <span>Vale na rede</span>}
                  {totalCreditos > 0 && (
                    <span>{moeda(p.preco / totalCreditos)} por atendimento</span>
                  )}
                </div>

                {isManager && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-3">
                    <button
                      onClick={() => onEditar(p)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => alternarAtivo(p)}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Power size={12} />
                      {p.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Desativar para de vender o pacote, mas quem já comprou continua podendo usar o saldo.
      </p>
    </div>
  )
}
