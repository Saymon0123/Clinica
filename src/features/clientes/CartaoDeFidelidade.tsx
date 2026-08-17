import { useCallback, useEffect, useState } from 'react'
import { Gift, Minus, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { useRecurso } from '../recursos/useRecurso'

/**
 * O cartão de fidelidade de um cliente, e os controles do barbeiro sobre ele.
 *
 * **Participação é padrão da barbearia com exceção aqui.** Nulo em
 * `clients.fidelidade_participa` significa "segue o padrão" — e é o valor
 * inicial de propósito. Exigir que o barbeiro marque cliente por cliente faria
 * a funcionalidade morrer de atrito: no meio do corte, com o próximo esperando,
 * ninguém abre ficha para marcar cadastro. O cliente ouviria "você está no
 * cartão", voltaria na décima vez e não teria carimbo nenhum — pior que nunca
 * ter oferecido.
 *
 * **O ajuste manual existe para a fidelidade poder nascer.** No dia em que o
 * dono liga a chave, os clientes já têm cartão de papel no bolso com seis ou
 * sete carimbos. Sem uma forma de trazer isso, adotar significa brigar com a
 * clientela inteira. E como os carimbos são contados, somar por ajuste é a
 * forma honesta — forjar uma venda sujaria o financeiro e a comissão.
 */
type Cartao = {
  carimbos: number
  faltam: number
  a_cada: number
  tem_premio: boolean
  validade_meses: number
}

type Evento = {
  quando: string
  evento: string
  carimbos: number
  detalhe: string
}

const ROTULO: Record<string, string> = {
  carimbo: 'Carimbo',
  resgate: 'Prêmio entregue',
  ajuste: 'Ajuste',
}

export function CartaoDeFidelidade({ clientId }: { clientId: string }) {
  const { salonId, isManager } = useSalon()
  const temFidelidade = useRecurso('fidelidade')

  const [cartao, setCartao] = useState<Cartao | null>(null)
  const [participa, setParticipa] = useState<boolean | null>(null)
  const [metaPropria, setMetaPropria] = useState('')
  const [historico, setHistorico] = useState<Evento[]>([])
  const [motivo, setMotivo] = useState('')
  const [ajustando, setAjustando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    if (!temFidelidade || !salonId) return
    const [cli, card, hist] = await Promise.all([
      supabase
        .from('clients')
        .select('fidelidade_participa, fidelidade_a_cada')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('fidelidade_do_cliente')
        .select('carimbos, faltam, a_cada, tem_premio, validade_meses')
        .eq('client_id', clientId)
        .maybeSingle(),
      supabase
        .from('fidelidade_historico')
        .select('quando, evento, carimbos, detalhe')
        .eq('client_id', clientId)
        .order('quando', { ascending: false })
        .limit(12),
    ])
    setParticipa(cli.data?.fidelidade_participa ?? null)
    setMetaPropria(cli.data?.fidelidade_a_cada != null ? String(cli.data.fidelidade_a_cada) : '')
    setCartao(card.data)
    setHistorico(hist.data ?? [])
    setCarregado(true)
  }, [temFidelidade, salonId, clientId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvarCliente(campos: Record<string, unknown>) {
    setErro(null)
    const { error } = await supabase.from('clients').update(campos).eq('id', clientId)
    if (error) {
      console.error('Erro ao salvar fidelidade do cliente:', error)
      setErro('Não foi possível salvar.')
      return
    }
    carregar()
  }

  async function ajustar(quantidade: number) {
    if (!motivo.trim()) {
      setErro('Escreva o motivo — é ele que encerra a discussão depois.')
      return
    }
    setAjustando(true)
    setErro(null)
    const { error } = await supabase.from('fidelidade_ajustes').insert({
      salon_id: salonId,
      client_id: clientId,
      carimbos: quantidade,
      motivo: motivo.trim(),
    })
    setAjustando(false)
    if (error) {
      console.error('Erro ao ajustar carimbos:', error)
      setErro('Não foi possível ajustar.')
      return
    }
    setMotivo('')
    carregar()
  }

  if (!temFidelidade || !carregado) return null

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Gift size={13} />
        Fidelidade
      </h3>

      {cartao ? (
        <div
          className={`rounded-lg border p-3 ${
            cartao.tem_premio ? 'border-success/40 bg-success-soft' : 'border-border bg-surface-2'
          }`}
        >
          <div className="text-sm font-medium text-foreground">
            {cartao.tem_premio
              ? `Prêmio disponível — ${cartao.carimbos} de ${cartao.a_cada}`
              : `${cartao.carimbos} de ${cartao.a_cada} — ${
                  cartao.faltam === 1 ? 'falta 1' : `faltam ${cartao.faltam}`
                }`}
          </div>
          {/* Carimbos desenhados: o barbeiro reconhece o cartão de papel na
              hora, e o cliente entende sem ninguém explicar. */}
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from({ length: Math.min(cartao.a_cada, 30) }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-4 w-4 rounded-full border ${
                  i < cartao.carimbos ? 'bg-primary border-primary' : 'border-border-strong'
                }`}
              />
            ))}
          </div>
          {cartao.validade_meses > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Cada carimbo vale por {cartao.validade_meses} meses.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Este cliente está fora da fidelidade.
        </p>
      )}

      {isManager && (
        <>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Participa da fidelidade
            </label>
            <select
              value={participa === null ? 'padrao' : participa ? 'dentro' : 'fora'}
              onChange={(e) => {
                const v = e.target.value
                salvarCliente({
                  fidelidade_participa: v === 'padrao' ? null : v === 'dentro',
                })
              }}
              className="w-full border border-border-strong bg-surface text-foreground rounded px-2 py-2 text-sm"
            >
              <option value="padrao">Como a barbearia decidir</option>
              <option value="dentro">Sim, sempre</option>
              <option value="fora">Não</option>
            </select>

            <label className="block text-xs font-medium text-muted-foreground pt-1">
              Meta só deste cliente
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={metaPropria}
                placeholder="—"
                onChange={(e) => setMetaPropria(e.target.value)}
                onBlur={() =>
                  salvarCliente({
                    fidelidade_a_cada: metaPropria.trim() === '' ? null : Number(metaPropria),
                  })
                }
                className="w-20 border border-border-strong bg-surface text-foreground rounded px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-muted-foreground">
                atendimentos. Vazio usa a da barbearia.
              </span>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Somar ou tirar carimbos
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo — ex.: cartão de papel antigo"
              className="w-full border border-border-strong bg-surface text-foreground rounded px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => ajustar(1)}
                disabled={ajustando}
                className="flex-1 inline-flex items-center justify-center gap-1 border border-border-strong rounded px-2 py-1.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                <Plus size={14} /> 1 carimbo
              </button>
              <button
                onClick={() => ajustar(-1)}
                disabled={ajustando}
                className="flex-1 inline-flex items-center justify-center gap-1 border border-border-strong rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                <Minus size={14} /> 1 carimbo
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              O motivo fica no histórico com o seu nome. É ele que encerra discussão no balcão.
            </p>
          </div>
        </>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {historico.length > 0 && (
        <div className="space-y-1">
          {historico.map((h, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {new Date(h.quando).toLocaleDateString('pt-BR')} · {ROTULO[h.evento] ?? h.evento}
                {h.evento === 'ajuste' && ` (${h.carimbos > 0 ? '+' : ''}${h.carimbos})`}
              </span>
              <span className="truncate text-muted-foreground/70">{h.detalhe}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
