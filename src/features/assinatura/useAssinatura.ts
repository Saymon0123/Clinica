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
  cpfCnpj: string | null
  /** Até quando o WhatsApp segue atendendo depois do vencimento. */
  atendimentoAte: string | null
  /**
   * Já existe recorrência criada no Asaas.
   *
   * Não dá para usar o `status` para isso: entre assinar e o pagamento cair, a
   * assinatura segue como `trial` — não existe estado "aguardando pagamento" na
   * constraint do banco, e marcar como `atrasada` diria ao dono que ele está
   * devendo no minuto seguinte a ter assinado.
   */
  temRecorrencia: boolean
  /**
   * O plano dá direito às automações de WhatsApp (lembrete de 1h e confirmação
   * de chegada). Vem de `plans.inclui_automacoes`, a mesma coluna que a view
   * `salons_com_automacao` usa para decidir se o n8n envia — para a tela não
   * poder prometer o que o fluxo não entrega.
   */
  incluiAutomacoes: boolean
  /** Plano para o qual a assinatura vai mudar, quando há troca pendente. */
  planoAgendado: string | null
  /** Há uma cobrança de diferença esperando pagamento. */
  aguardandoPagamentoDaTroca: boolean
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
      .select(
        'status, plan_codigo, valor, acesso_ate, cpf_cnpj, atendimento_ate, asaas_subscription_id, plano_agendado, upgrade_payment_id, plans(nome, inclui_automacoes)',
      )
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

    type PlanoJoin = { nome?: string; inclui_automacoes?: boolean }
    const planoBruto = data.plans as PlanoJoin | PlanoJoin[] | null
    const plano = Array.isArray(planoBruto) ? planoBruto[0] : planoBruto
    const planoNome = plano?.nome ?? data.plan_codigo
    const dias = data.acesso_ate ? diasAte(data.acesso_ate) : null

    setAssinatura({
      status: data.status as StatusAssinatura,
      planoCodigo: data.plan_codigo,
      planoNome,
      valor: data.valor != null ? Number(data.valor) : null,
      acessoAte: data.acesso_ate,
      diasRestantes: dias,
      expirada: dias !== null && dias < 0,
      cpfCnpj: data.cpf_cnpj,
      atendimentoAte: data.atendimento_ate,
      temRecorrencia: Boolean(data.asaas_subscription_id),
      incluiAutomacoes: Boolean(plano?.inclui_automacoes),
      planoAgendado: data.plano_agendado,
      aguardandoPagamentoDaTroca: Boolean(data.upgrade_payment_id),
    })
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { assinatura, loading, reload }
}
