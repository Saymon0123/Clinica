import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type StatusAssinatura = 'trial' | 'pendente' | 'ativa' | 'atrasada' | 'cancelada'

/**
 * O que resta da assinatura no modelo por uso (2026-08-25): a situação do
 * acesso e o documento do pagante. Os campos de plano, recorrência e troca
 * morreram junto com o modelo Básico/Pro — nenhuma tela os consumia mais, e a
 * tabela `plans` foi aposentada (0110).
 */
export type Assinatura = {
  status: StatusAssinatura
  /** `null` = sem vencimento automático (barbearia que já paga, cobrança por fora). */
  acessoAte: string | null
  /** Dias inteiros até o vencimento. Negativo quando já venceu. `null` sem prazo. */
  diasRestantes: number | null
  expirada: boolean
  cpfCnpj: string | null
  /** Até quando o WhatsApp segue atendendo depois do vencimento. */
  atendimentoAte: string | null
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
  const [erro, setErro] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!salonId) {
      setAssinatura(null)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, acesso_ate, cpf_cnpj, atendimento_ate')
      .eq('salon_id', salonId)
      .maybeSingle()

    // Falha de consulta e ausência de assinatura são coisas diferentes, e
    // tratá-las igual esconde defeito: um join ambíguo derrubou esta consulta
    // em 2026-08-02 e a tela anunciou, com toda a calma, que a barbearia não
    // tinha plano — apontando o dono para o suporte em vez de mostrar o erro.
    if (error) {
      console.error('Erro ao carregar assinatura:', error)
      setAssinatura(null)
      setErro('Não foi possível carregar a assinatura agora.')
      setLoading(false)
      return
    }

    setErro(null)

    if (!data) {
      // Barbearia criada antes desta funcionalidade não tem assinatura. Isso
      // não é erro: some da tela em vez de acusar problema para o dono.
      setAssinatura(null)
      setLoading(false)
      return
    }

    const dias = data.acesso_ate ? diasAte(data.acesso_ate) : null

    setAssinatura({
      status: data.status as StatusAssinatura,
      acessoAte: data.acesso_ate,
      diasRestantes: dias,
      expirada: dias !== null && dias < 0,
      cpfCnpj: data.cpf_cnpj,
      atendimentoAte: data.atendimento_ate,
    })
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { assinatura, loading, erro, reload }
}
