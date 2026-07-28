import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PacoteItem = { serviceId: string; quantidade: number }

export type Pacote = {
  id: string
  nome: string
  descricao: string | null
  preco: number
  validadeDias: number | null
  valeNaRede: boolean
  enviarReciboPorUso: boolean
  ativo: boolean
  itens: PacoteItem[]
}

type LinhaPacote = {
  id: string
  nome: string
  descricao: string | null
  preco: number | string
  validade_dias: number | null
  vale_na_rede: boolean
  enviar_recibo_por_uso: boolean
  ativo: boolean
  package_items: { service_id: string; quantidade: number }[] | null
}

/** Catálogo de pacotes da unidade. */
export function usePackagesData(salonId: string | null) {
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!salonId) return
    setLoading(true)
    setErro(null)

    const { data, error } = await supabase
      .from('packages')
      .select(
        'id, nome, descricao, preco, validade_dias, vale_na_rede, enviar_recibo_por_uso, ativo, package_items(service_id, quantidade)',
      )
      .eq('salon_id', salonId)
      .order('nome')

    if (error) {
      console.error('Erro ao carregar pacotes:', error)
      setErro('Não foi possível carregar os pacotes.')
      setLoading(false)
      return
    }

    setPacotes(
      ((data ?? []) as LinhaPacote[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        preco: Number(p.preco) || 0,
        validadeDias: p.validade_dias,
        valeNaRede: p.vale_na_rede,
        enviarReciboPorUso: p.enviar_recibo_por_uso,
        ativo: p.ativo,
        itens: (p.package_items ?? []).map((i) => ({
          serviceId: i.service_id,
          quantidade: i.quantidade,
        })),
      })),
    )
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { pacotes, loading, erro, recarregar }
}

export type SaldoPacote = {
  clientPackageId: string
  serviceId: string
  total: number
  usados: number
  saldo: number
  expiraEm: string | null
  valorPorCredito: number
}

/**
 * Saldo dos pacotes de um cliente.
 *
 * Vem da view `client_package_saldo`, que calcula pelo total menos os usos —
 * assim não existe contador para sair de sincronia quando uma comanda é
 * cancelada e o crédito precisa voltar.
 */
export function useSaldoDoCliente(clientId: string | null | undefined) {
  const [saldos, setSaldos] = useState<SaldoPacote[]>([])
  const [loading, setLoading] = useState(false)

  const recarregar = useCallback(async () => {
    if (!clientId) {
      setSaldos([])
      return
    }
    setLoading(true)

    const { data, error } = await supabase
      .from('client_package_saldo')
      .select('client_package_id, service_id, total, usados, saldo, expira_em, valor_por_credito')
      .eq('client_id', clientId)
      .eq('status', 'ativo')
      .gt('saldo', 0)

    if (error) {
      console.error('Erro ao carregar saldo de pacotes:', error)
      setSaldos([])
      setLoading(false)
      return
    }

    const hoje = new Date().toISOString().slice(0, 10)
    setSaldos(
      ((data ?? []) as Record<string, unknown>[])
        // Pacote vencido não pode ser usado, mesmo com saldo.
        .filter((r) => !r.expira_em || String(r.expira_em) >= hoje)
        .map((r) => ({
          clientPackageId: String(r.client_package_id),
          serviceId: String(r.service_id),
          total: Number(r.total) || 0,
          usados: Number(r.usados) || 0,
          saldo: Number(r.saldo) || 0,
          expiraEm: (r.expira_em as string | null) ?? null,
          valorPorCredito: Number(r.valor_por_credito) || 0,
        })),
    )
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { saldos, loading, recarregar }
}
