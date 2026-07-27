import { useCallback, useEffect, useState } from 'react'
import { Lock, LockOpen, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'

type Caixa = {
  id: string
  aberto_em: string
  valor_abertura: number | string
  status: string
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Abertura e fechamento do caixa do dia.
 *
 * O "esperado" soma só os pagamentos em dinheiro desde a abertura — cartão e
 * pix não passam pela gaveta, então incluí-los faria a conferência fechar
 * errado todo dia.
 */
export function CaixaSection({ salonId }: { salonId: string }) {
  const { user } = useAuth()
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const [emDinheiro, setEmDinheiro] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [valorAbertura, setValorAbertura] = useState('0')
  const [valorFechamento, setValorFechamento] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)

    const { data, error } = await supabase
      .from('cash_registers')
      .select('id, aberto_em, valor_abertura, status')
      .eq('salon_id', salonId)
      .eq('status', 'aberto')
      .order('aberto_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Erro ao carregar o caixa:', error)
      setErro('Não foi possível carregar o caixa.')
      setCarregando(false)
      return
    }

    setCaixa(data as Caixa | null)

    if (data) {
      // Soma pelas comandas amarradas a ESTE caixa, e não por data: com dois
      // caixas no mesmo dia, filtrar por horário misturaria os dois.
      const { data: pagamentos } = await supabase
        .from('payments')
        .select('valor, orders!inner(cash_register_id)')
        .eq('orders.cash_register_id', data.id)
        .eq('forma_pagamento', 'dinheiro')

      const soma = (pagamentos ?? []).reduce(
        (s: number, p: { valor: number | string }) => s + (Number(p.valor) || 0),
        0,
      )
      setEmDinheiro(soma)
    } else {
      setEmDinheiro(0)
    }

    setCarregando(false)
  }, [salonId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function abrir() {
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('cash_registers').insert({
      salon_id: salonId,
      aberto_por: user?.id ?? null,
      valor_abertura: Number(valorAbertura) || 0,
      status: 'aberto',
    })
    setSalvando(false)
    if (error) {
      console.error('Erro ao abrir o caixa:', error)
      setErro('Não foi possível abrir o caixa.')
      return
    }
    carregar()
  }

  async function fechar() {
    if (!caixa) return
    if (valorFechamento.trim() === '') {
      setErro('Informe quanto tinha na gaveta ao fechar.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('cash_registers')
      .update({
        status: 'fechado',
        fechado_em: new Date().toISOString(),
        valor_fechamento: Number(valorFechamento) || 0,
      })
      .eq('id', caixa.id)
    setSalvando(false)
    if (error) {
      console.error('Erro ao fechar o caixa:', error)
      setErro('Não foi possível fechar o caixa.')
      return
    }
    setValorFechamento('')
    carregar()
  }

  const esperado = caixa ? (Number(caixa.valor_abertura) || 0) + emDinheiro : 0
  const informado = Number(valorFechamento)
  const diferenca = valorFechamento.trim() === '' ? null : informado - esperado

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Caixa</h2>
      </div>

      {erro && <p className="text-sm text-danger mb-3">{erro}</p>}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !caixa ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Nenhum caixa aberto no momento.</p>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Troco inicial na gaveta</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={valorAbertura}
              onChange={(e) => setValorAbertura(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={abrir}
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <LockOpen size={15} />
            {salvando ? 'Abrindo...' : 'Abrir caixa'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Aberto em{' '}
            {new Date(caixa.aberto_em).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-2 rounded-lg px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Abertura</div>
              <div className="text-sm font-semibold text-foreground">
                {moeda(Number(caixa.valor_abertura) || 0)}
              </div>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Em dinheiro</div>
              <div className="text-sm font-semibold text-foreground">{moeda(emDinheiro)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Esperado</div>
              <div className="text-sm font-semibold text-foreground">{moeda(esperado)}</div>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Contagem da gaveta</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={valorFechamento}
              onChange={(e) => setValorFechamento(e.target.value)}
              placeholder="Quanto tinha de verdade"
              className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
            />
          </label>

          {diferenca !== null && (
            <p
              className={`text-xs font-medium ${
                Math.abs(diferenca) < 0.01 ? 'text-success' : 'text-danger'
              }`}
            >
              {Math.abs(diferenca) < 0.01
                ? 'Bateu certinho com o esperado.'
                : diferenca > 0
                  ? `Sobrando ${moeda(diferenca)} em relação ao esperado.`
                  : `Faltando ${moeda(Math.abs(diferenca))} em relação ao esperado.`}
            </p>
          )}

          <button
            onClick={fechar}
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            <Lock size={15} />
            {salvando ? 'Fechando...' : 'Fechar caixa'}
          </button>

          <p className="text-xs text-muted-foreground">
            O esperado considera só pagamentos em dinheiro desde a abertura — cartão e pix não passam
            pela gaveta.
          </p>
        </div>
      )}
    </div>
  )
}
