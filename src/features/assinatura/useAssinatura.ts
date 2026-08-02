import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type StatusAssinatura = 'trial' | 'ativa' | 'atrasada' | 'cancelada'

export type Assinatura = {
  status: StatusAssinatura
  planoCodigo: string
  planoNome: string
  valor: number | null
  /** `null` = sem vencimento automático (barbearia que já paga, cobrança por fora). */
  acessoAte: string | null
  /** Dias inteiros até o vencimento. Negativo quando já venceu. `null` sem prazo. */
  diasRestantes: number | null
  expirada: boolean
}

/**
 * Conta os dias até o fim do acesso.
 *
 * Compara **datas**, não instantes: `acesso_ate` é `date`, e usar `Date.now()`
 * cru faria "vence hoje" virar "venceu" a partir da primeira hora do dia. O
 * dono perderia o último dia que pagou.
 */
function diasAte(acessoAte: string): number {
  const [ano, mes, dia] = acessoAte.split('-').map(Number)
  const fim = new Date(ano, mes - 1, dia)
  const hoje = new Date()
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((fim.getTime() - hojeSemHora.getTime()) / 86400000)
}

export function useAssinatura(salonId: string | null) {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!salonId) {
      setAssinatura(null)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, plan_codigo, valor, acesso_ate, plans(nome)')
      .eq('salon_id', salonId)
      .maybeSingle()

    if (error || !data) {
      // Barbearia criada antes desta funcionalidade não tem assinatura. Isso
      // não é erro: some da tela em vez de acusar problema para o dono.
      if (error) console.error('Erro ao carregar assinatura:', error)
      setAssinatura(null)
      setLoading(false)
      return
    }

    const plano = data.plans as { nome?: string } | { nome?: string }[] | null
    const planoNome = (Array.isArray(plano) ? plano[0]?.nome : plano?.nome) ?? data.plan_codigo
    const dias = data.acesso_ate ? diasAte(data.acesso_ate) : null

    setAssinatura({
      status: data.status as StatusAssinatura,
      planoCodigo: data.plan_codigo,
      planoNome,
      valor: data.valor != null ? Number(data.valor) : null,
      acessoAte: data.acesso_ate,
      diasRestantes: dias,
      expirada: dias !== null && dias < 0,
    })
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { assinatura, loading, reload }
}
