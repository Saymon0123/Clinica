import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSaldoDoCliente } from './usePackagesData'

/**
 * Pacotes ativos de um cliente, com saldo por serviço.
 *
 * Aparece no cadastro do cliente e no detalhe do agendamento — os dois
 * momentos em que alguém precisa saber que há crédito antes de cobrar.
 */
export function SaldoPacotes({ clientId, compacto }: { clientId: string; compacto?: boolean }) {
  const { saldos, loading } = useSaldoDoCliente(clientId)
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (saldos.length === 0) return
    const ids = [...new Set(saldos.map((s) => s.serviceId))]
    supabase
      .from('services')
      .select('id, nome')
      .in('id', ids)
      .then(({ data }) => {
        setNomes(new Map((data ?? []).map((s: { id: string; nome: string }) => [s.id, s.nome])))
      })
  }, [saldos])

  if (loading || saldos.length === 0) return null

  const resumo = saldos
    .map((s) => `${s.saldo} ${nomes.get(s.serviceId) ?? 'atendimento'}`)
    .join(' · ')

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full bg-success-soft text-success px-2 py-0.5">
        <Package size={11} />
        {resumo}
      </span>
    )
  }

  // A validade mais próxima é a que importa para o cliente.
  const vencimento = saldos
    .map((s) => s.expiraEm)
    .filter((d): d is string => !!d)
    .sort()[0]

  return (
    <div className="mb-5 rounded-lg border border-success bg-success-soft p-3">
      <div className="flex items-center gap-2">
        <Package size={15} className="text-success" />
        <span className="text-sm font-semibold text-foreground">Pacote ativo</span>
      </div>
      <p className="mt-1 text-sm text-foreground">{resumo} a usar</p>
      {vencimento && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Vence em {new Date(`${vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  )
}
