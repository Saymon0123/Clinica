import { useCallback, useEffect, useState } from 'react'
import { Lock, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'

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
 * O caixa é automático desde 2026-08-25: abre sozinho na primeira venda do dia
 * (com o troco padrão do salão) e fecha sozinho à meia-noite com o valor
 * esperado — o ritual manual diário era esquecido e inutilizava a conferência.
 *
 * O que sobra para o dono aqui: configurar o troco padrão uma única vez e,
 * se quiser, conferir a gaveta no fim do dia (o fechamento manual com contagem
 * continua existindo, mas é opcional).
 *
 * O "esperado" soma só os pagamentos em dinheiro desde a abertura — cartão e
 * pix não passam pela gaveta, então incluí-los faria a conferência fechar
 * errado todo dia.
 */
export function CaixaSection({ salonId }: { salonId: string }) {
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const [emDinheiro, setEmDinheiro] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trocoPadrao, setTrocoPadrao] = useState('0')
  const [valorFechamento, setValorFechamento] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)

    const [{ data, error }, { data: salao }] = await Promise.all([
      supabase
        .from('cash_registers')
        .select('id, aberto_em, valor_abertura, status')
        .eq('salon_id', salonId)
        .eq('status', 'aberto')
        .order('aberto_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('salons').select('troco_padrao').eq('id', salonId).maybeSingle(),
    ])

    if (error) {
      console.error('Erro ao carregar o caixa:', error)
      setErro('Não foi possível carregar o caixa.')
      setCarregando(false)
      return
    }

    setCaixa(data as Caixa | null)
    if (salao) setTrocoPadrao(String(Number(salao.troco_padrao) || 0))

    if (data) {
      // payments não tem data própria; a referência é o fechamento da comanda.
      const { data: pagamentos } = await supabase
        .from('payments')
        .select('valor, orders!inner(salon_id, closed_at)')
        .eq('orders.salon_id', salonId)
        .eq('forma_pagamento', 'dinheiro')
        .gte('orders.closed_at', data.aberto_em)

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

  async function salvarTroco() {
    setSalvando(true)
    setErro(null)
    setAviso(null)
    const { error } = await supabase
      .from('salons')
      .update({ troco_padrao: Number(trocoPadrao) || 0 })
      .eq('id', salonId)
    setSalvando(false)
    if (error) {
      console.error('Erro ao salvar o troco padrão:', error)
      setErro('Não foi possível salvar o troco padrão.')
      return
    }
    setAviso('Troco padrão salvo. Vale a partir do próximo caixa.')
  }

  async function conferirEFechar() {
    if (!caixa) return
    if (valorFechamento.trim() === '') {
      setErro('Informe quanto tinha na gaveta para conferir.')
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
        fechado_automaticamente: false,
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
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Caixa</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Abre sozinho na primeira venda do dia e fecha sozinho à meia-noite — você não precisa fazer
        nada.
      </p>

      {erro && <p className="text-sm text-danger mb-3">{erro}</p>}
      {aviso && <p className="text-sm text-success mb-3">{aviso}</p>}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !caixa ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nenhuma venda ainda hoje. Na primeira venda o caixa abre com o troco padrão abaixo.
          </p>
          <div className="flex items-end gap-2 max-w-xs">
            <label className="block flex-1">
              <span className="text-xs font-medium text-muted-foreground">
                Troco padrão na gaveta
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={trocoPadrao}
                onChange={(e) => setTrocoPadrao(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={salvarTroco}
              disabled={salvando}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
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
              <div className="text-[11px] text-muted-foreground">Esperado na gaveta</div>
              <div className="text-sm font-semibold text-foreground">{moeda(esperado)}</div>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary hover:underline list-none">
              Conferir a gaveta (opcional)
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Contagem da gaveta</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFechamento}
                  onChange={(e) => setValorFechamento(e.target.value)}
                  placeholder="Quanto tinha de verdade"
                  className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
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
                onClick={conferirEFechar}
                disabled={salvando}
                className="w-full flex items-center justify-center gap-2 btn-secondary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Lock size={15} />
                {salvando ? 'Fechando...' : 'Registrar contagem e fechar o dia'}
              </button>
            </div>
          </details>

          <p className="text-xs text-muted-foreground">
            O esperado considera só pagamentos em dinheiro desde a abertura — cartão e pix não passam
            pela gaveta. Se você não conferir, à meia-noite o caixa fecha sozinho com o esperado.
          </p>
        </div>
      )}
    </div>
  )
}
