import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { SaldoDePacote } from './saldoDoCliente'

/**
 * Saldo vigente de pacotes de UM cliente, para telas que só mostram (Agenda).
 *
 * Mesma consulta que o caixa (`NewSaleModal`) faz na view `saldo_de_pacotes`,
 * com as mesmas escolhas: vencido fica fora, e ERRO fica em silêncio — saldo é
 * informação de apoio, e falhar em buscá-lo nunca pode travar nem sujar a tela
 * de quem só veio olhar um agendamento. O console guarda o erro para
 * diagnóstico.
 *
 * A RLS deixa qualquer membro do salão ler (policies "membros leem" da 0112),
 * então o barbeiro vê o mesmo que o dono aqui.
 */
export function useSaldoDePacotes(clientId: string | null | undefined) {
  const [saldos, setSaldos] = useState<SaldoDePacote[]>([])

  useEffect(() => {
    if (!clientId) {
      setSaldos([])
      return
    }
    let cancelado = false
    supabase
      .from('saldo_de_pacotes')
      .select('pacote_do_cliente_id, pacote, service_id, servico, restante, expira_em, vencido')
      .eq('client_id', clientId)
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          console.error('Erro ao buscar saldo de pacotes:', error)
          return
        }
        setSaldos(((data ?? []) as SaldoDePacote[]).filter((x) => !x.vencido))
      })
    return () => {
      cancelado = true
    }
  }, [clientId])

  return saldos
}
