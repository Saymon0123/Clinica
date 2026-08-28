import { useCallback, useEffect, useState } from 'react'
import { Building2, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invokeFunction } from '../../lib/invokeFunction'
import { useSalon } from '../auth/useSalon'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type UsoDaUnidade = {
  salon_id: string
  barbearia: string
  agendamentos: number
  preco_unitario: number
}

type Rede = {
  cobrancaUnificada: boolean
  cpfCnpj: string | null
}

/**
 * A cobrança da rede no modelo por uso: quanto cada unidade está consumindo no
 * mês, e o formato do boleto — um por unidade, ou um único com todas.
 *
 * A escolha é uma PREFERÊNCIA, não uma recorrência: desde 2026-08-24 o boleto é
 * emitido à mão a partir do fechamento mensal, e a flag diz ao faturamento para
 * tratar a rede como um pagante só. Nenhuma chamada ao Asaas nasce daqui.
 */
export function CobrancaDaRede() {
  const { salonId, organizationId, unidades, isNetwork } = useSalon()
  const proprias = unidades.filter((u) => u.role === 'owner')

  const [usos, setUsos] = useState<UsoDaUnidade[]>([])
  const [rede, setRede] = useState<Rede | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!organizationId || proprias.length < 2) return
    setCarregando(true)

    const [org, uso] = await Promise.all([
      supabase
        .from('organizations')
        .select('cobranca_unificada, cpf_cnpj')
        .eq('id', organizationId)
        .maybeSingle(),
      supabase
        .from('uso_do_sistema_no_mes')
        .select('salon_id, barbearia, agendamentos, preco_unitario')
        .in(
          'salon_id',
          proprias.map((u) => u.salonId),
        ),
    ])

    const dadosDaRede = org.data
    if (dadosDaRede) {
      setRede({ cobrancaUnificada: dadosDaRede.cobranca_unificada, cpfCnpj: dadosDaRede.cpf_cnpj })
      setCpfCnpj((atual) => atual || dadosDaRede.cpf_cnpj || '')
    }
    setUsos((uso.data ?? []) as UsoDaUnidade[])
    setCarregando(false)
    // proprias é derivado de `unidades`; a identidade muda a cada render, mas o
    // conteúdo só muda quando `unidades` muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, unidades])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!isNetwork || !organizationId || proprias.length < 2) return null

  const total = usos.reduce((acc, u) => acc + u.agendamentos * Number(u.preco_unitario), 0)

  async function alternar() {
    const acao = rede?.cobrancaUnificada ? 'separar-rede' : 'unificar-rede'
    setAgindo(true)
    setErro(null)
    const { error } = await invokeFunction(
      'asaas',
      { body: { acao, organizationId, cpfCnpj: cpfCnpj.trim() || undefined } },
      'Não foi possível salvar a preferência.',
    )
    setAgindo(false)
    if (error) {
      setErro(error)
      return
    }
    await carregar()
  }

  return (
    <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Building2 size={18} />
          Cobrança da rede
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cada unidade paga pelo próprio uso. Aqui você acompanha o mês de todas e escolhe o
          formato do boleto: um por unidade, ou um único com a soma.
        </p>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {usos.map((u) => (
              <li key={u.salon_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm text-foreground">{u.barbearia}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {u.agendamentos} agendamento{u.agendamentos === 1 ? '' : 's'} ×{' '}
                    {moeda(Number(u.preco_unitario))}
                    {u.salon_id === salonId ? ' · unidade atual' : ''}
                  </span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {moeda(u.agendamentos * Number(u.preco_unitario))}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between px-3 py-2 bg-surface-2">
              <span className="text-sm font-semibold text-foreground">Total da rede no mês</span>
              <span className="text-sm font-semibold text-foreground">{moeda(total)}</span>
            </li>
          </ul>

          {rede?.cobrancaUnificada ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-success">
                <Receipt size={16} />
                Boleto único da rede: uma cobrança cobre as {usos.length} unidades.
              </p>
              <button
                type="button"
                onClick={alternar}
                disabled={agindo}
                className="text-sm text-muted-foreground hover:text-danger hover:underline disabled:opacity-50"
              >
                {agindo ? 'Salvando...' : 'Voltar a um boleto por unidade'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block max-w-xs">
                <span className="text-xs font-medium text-muted-foreground">
                  CPF ou CNPJ do pagante da rede
                </span>
                <input
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={alternar}
                disabled={agindo}
                className="inline-flex items-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Receipt size={16} />
                {agindo ? 'Salvando...' : 'Receber um boleto único da rede'}
              </button>
              <p className="text-xs text-muted-foreground">
                O fechamento continua por unidade; o boleto vem um só, com a soma de todas.
              </p>
            </div>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}
        </>
      )}
    </section>
  )
}
