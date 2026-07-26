import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type Recurso = 'rede' | 'lembretes' | 'recuperacao' | 'site'

export type Plano = {
  codigo: 'basico' | 'pro'
  nome: string
  descricao: string | null
  precoUnidade: number
  precoUnidadeRede: number
  recursos: Partial<Record<Recurso, boolean>>
  ordem: number
}

export type StatusAssinatura = 'trial' | 'ativa' | 'atrasada' | 'cancelada'

export type Assinatura = {
  planCodigo: 'basico' | 'pro'
  status: StatusAssinatura
  valor: number | null
  proximoVencimento: string | null
}

/**
 * Planos disponíveis e a assinatura da unidade atual.
 *
 * A assinatura só é legível pelo dono (política do banco). Para gerente e
 * barbeiro isso volta vazio, e a tela de assinatura nem aparece para eles.
 */
export function usePlano(salonId: string | null) {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)

    const [planosRes, assinaturaRes] = await Promise.all([
      supabase
        .from('plans')
        .select('codigo, nome, descricao, preco_unidade, preco_unidade_rede, recursos, ordem')
        .eq('ativo', true)
        .order('ordem'),
      salonId
        ? supabase
            .from('subscriptions')
            .select('plan_codigo, status, valor, proximo_vencimento')
            .eq('salon_id', salonId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (planosRes.error) {
      console.error('Erro ao carregar planos:', planosRes.error)
      setErro('Não foi possível carregar os planos.')
      setLoading(false)
      return
    }

    type LinhaPlano = {
      codigo: string
      nome: string
      descricao: string | null
      preco_unidade: number | string
      preco_unidade_rede: number | string
      recursos: Partial<Record<Recurso, boolean>> | null
      ordem: number
    }

    setPlanos(
      ((planosRes.data ?? []) as LinhaPlano[]).map((p) => ({
        codigo: p.codigo as 'basico' | 'pro',
        nome: p.nome,
        descricao: p.descricao,
        precoUnidade: Number(p.preco_unidade) || 0,
        precoUnidadeRede: Number(p.preco_unidade_rede) || 0,
        recursos: p.recursos ?? {},
        ordem: p.ordem,
      })),
    )

    const linha = assinaturaRes.data as {
      plan_codigo?: string
      status?: string
      valor?: number | string | null
      proximo_vencimento?: string | null
    } | null

    setAssinatura(
      linha
        ? {
            planCodigo: linha.plan_codigo as 'basico' | 'pro',
            status: linha.status as StatusAssinatura,
            valor: linha.valor != null ? Number(linha.valor) : null,
            proximoVencimento: linha.proximo_vencimento ?? null,
          }
        : null,
    )
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const planoAtual = planos.find((p) => p.codigo === assinatura?.planCodigo) ?? null

  // Assinatura cancelada não libera nada além do básico do sistema.
  const acessoValido = assinatura?.status !== 'cancelada'

  function temRecurso(recurso: Recurso) {
    if (!acessoValido) return false
    return planoAtual?.recursos[recurso] === true
  }

  return { planos, assinatura, planoAtual, temRecurso, loading, erro, recarregar: carregar }
}
