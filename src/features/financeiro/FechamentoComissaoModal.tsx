import { useCallback, useEffect, useState } from 'react'
import { Check, HandCoins, Undo2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'
import { Campo, Input } from '../../components/Campo'
import { SkeletonLinhas } from '../../components/Skeleton'
import { ErroInline } from '../../components/ErroInline'
import {
  agruparPorProfissional,
  intervaloDoMes,
  mesFechado,
  TETO_DE_LINHAS,
  type PorProfissional,
} from './fechamentoDeComissao'

type LinhaDoBanco = {
  id: string
  valor_calculado: number | string
  pago: boolean
  professional_id: string
  professionals: { nome?: string } | { nome?: string }[] | null
}

type Confirmacao = { professionalId: string; acao: 'pagar' | 'desfazer' }

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function primeiro<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined)
}

/**
 * Fechamento de comissão: lê a tabela `commissions` (o valor gravado na hora
 * da venda) em vez de recalcular a partir dos itens. Recalcular daria número
 * diferente se o percentual do profissional mudasse depois da venda.
 *
 * Achado 40 da revisão de 01/09: "Marcar como pago" quitava N comissões
 * direto do clique, sem confirmação e sem volta, e a consulta baixava o
 * salão inteiro para filtrar o mês no navegador. Agora o recorte de data vai
 * na consulta, o toque pede confirmação inline (o padrão do estorno e do
 * cancelar da agenda) e "Desfazer" devolve as comissões para "a pagar"
 * enquanto o mês não vira.
 */
export function FechamentoComissaoModal({
  salonId,
  mesInicial,
  onClose,
}: {
  salonId: string
  /** 'YYYY-MM' — o mês navegado na página; sem ele, o corrente. */
  mesInicial?: string
  onClose: () => void
}) {
  const [linhas, setLinhas] = useState<PorProfissional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<Confirmacao | null>(null)
  const [incompleta, setIncompleta] = useState(false)
  const [mes, setMes] = useState(() => mesInicial ?? new Date().toISOString().slice(0, 7))

  const fechado = mesFechado(mes)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    setConfirmando(null)

    const { inicio, fim } = intervaloDoMes(mes)
    const { data, error } = await supabase
      .from('commissions')
      .select(
        'id, valor_calculado, pago, professional_id, professionals!inner(nome, salon_id), order_items!inner(orders!inner(status, closed_at))',
      )
      .eq('professionals.salon_id', salonId)
      // Mesmo recorte do card do Financeiro (passo 4.2): só comanda fechada.
      .eq('order_items.orders.status', 'fechada')
      .gte('order_items.orders.closed_at', inicio.toISOString())
      .lt('order_items.orders.closed_at', fim.toISOString())
      .limit(TETO_DE_LINHAS)

    if (error) {
      console.error('Erro ao carregar comissões:', error)
      setErro('Não foi possível carregar as comissões.')
      setCarregando(false)
      return
    }

    const brutas = (data ?? []) as unknown as LinhaDoBanco[]
    setIncompleta(brutas.length >= TETO_DE_LINHAS)
    setLinhas(
      agruparPorProfissional(
        brutas.map((l) => ({
          id: l.id,
          valor_calculado: l.valor_calculado,
          pago: l.pago,
          professional_id: l.professional_id,
          nome: primeiro(l.professionals)?.nome ?? 'Profissional',
        })),
      ).filter((g) => g.valor > 0),
    )
    setCarregando(false)
  }, [salonId, mes])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcar(linha: PorProfissional, pago: boolean) {
    const ids = pago ? linha.pendenteIds : linha.pagoIds
    if (ids.length === 0) return
    setAgindo(linha.professionalId)
    setErro(null)

    const { error } = await supabase
      .from('commissions')
      .update({ pago, pago_em: pago ? new Date().toISOString() : null })
      .in('id', ids)

    setAgindo(null)
    setConfirmando(null)
    if (error) {
      console.error('Erro ao registrar o fechamento de comissão:', error)
      setErro(pago ? 'Não foi possível registrar o pagamento.' : 'Não foi possível desfazer o pagamento.')
      return
    }
    toast(pago ? 'Comissão marcada como paga' : 'Pagamento desfeito: as comissões voltaram para "a pagar"')
    carregar()
  }

  const totalPendente = linhas.reduce((s, l) => s + l.pendenteValor, 0)
  const totalPago = linhas.reduce((s, l) => s + l.pagoValor, 0)

  return (
    <Modal
      onClose={onClose}
      titulo={
        <span className="flex items-center gap-2">
          <HandCoins size={18} />
          Fechamento de comissão
        </span>
      }
      tamanho="md"
      bloquearFechamento={agindo !== null}
    >
      <Campo rotulo="Mês de referência" htmlFor="mes-referencia">
        <Input id="mes-referencia" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
      </Campo>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-2 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">A pagar</div>
          <div className="text-lg font-semibold text-foreground">{moeda(totalPendente)}</div>
        </div>
        <div className="bg-surface-2 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">Já pago</div>
          <div className="text-lg font-semibold text-success">{moeda(totalPago)}</div>
        </div>
      </div>

      <ErroInline>{erro}</ErroInline>

      {incompleta && (
        <p className="text-xs text-warning">
          Este mês tem mais de {TETO_DE_LINHAS} comissões e a lista pode estar incompleta. Feche por
          quinzena ou fale com o suporte.
        </p>
      )}

      {carregando ? (
        <SkeletonLinhas />
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhuma comissão registrada neste mês.
        </p>
      ) : (
        <div className="space-y-2">
          {linhas.map((l) => {
            const confirmandoEsta = confirmando?.professionalId === l.professionalId ? confirmando : null
            const ocupado = agindo === l.professionalId
            return (
              <div key={l.professionalId} className="bg-surface-2 rounded-lg px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.pendenteValor > 0 ? `${moeda(l.pendenteValor)} a pagar` : 'Tudo pago neste mês'}
                      {l.pagoValor > 0 && ` · ${moeda(l.pagoValor)} já pago`}
                    </div>
                  </div>
                  {!confirmandoEsta && (
                    <div className="flex items-center gap-2 shrink-0">
                      {l.pagoIds.length > 0 && !fechado && (
                        <button
                          onClick={() => setConfirmando({ professionalId: l.professionalId, acao: 'desfazer' })}
                          disabled={ocupado}
                          className="inline-flex items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Undo2 size={14} />
                          Desfazer
                        </button>
                      )}
                      {l.pendenteValor > 0 ? (
                        <button
                          onClick={() => setConfirmando({ professionalId: l.professionalId, acao: 'pagar' })}
                          disabled={ocupado}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        >
                          Marcar como pago
                        </button>
                      ) : (
                        <Check size={16} className="text-success shrink-0" />
                      )}
                    </div>
                  )}
                </div>

                {confirmandoEsta && (
                  /* Confirmação inline, como no estorno da venda: marcar como
                     pago fecha N comissões de uma vez, então a frase diz o
                     valor e o nome antes do toque. */
                  <div className="border border-border-strong rounded-lg px-3 py-3 space-y-3 bg-surface">
                    <p className="text-xs text-foreground">
                      {confirmandoEsta.acao === 'pagar'
                        ? `Marcar ${moeda(l.pendenteValor)} de ${l.nome} como pago? Vale para ${l.pendenteIds.length} ${
                            l.pendenteIds.length === 1 ? 'comissão' : 'comissões'
                          } deste mês.`
                        : `Desfazer o pagamento de ${moeda(l.pagoValor)} de ${l.nome}? As comissões voltam para "a pagar".`}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmando(null)}
                        disabled={ocupado}
                        className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={() => marcar(l, confirmandoEsta.acao === 'pagar')}
                        disabled={ocupado}
                        className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {ocupado
                          ? 'Salvando...'
                          : confirmandoEsta.acao === 'pagar'
                            ? 'Sim, marcar como pago'
                            : 'Sim, desfazer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Os valores vêm do que foi gravado na venda, então mudar o percentual do barbeiro depois não
        altera comissões antigas.{' '}
        {fechado
          ? 'Mês encerrado: o fechamento fica registrado e não pode mais ser desfeito.'
          : 'Marcou errado? "Desfazer" devolve as comissões para "a pagar" enquanto o mês não vira.'}
      </p>
    </Modal>
  )
}
