import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type ItemDeAtivacao = {
  id: 'assinatura' | 'whatsapp' | 'servicos' | 'jornada' | 'comissao'
  titulo: string
  /** O que a barbearia perde enquanto isso não estiver feito. */
  porque: string
  rota: string
  feito: boolean
}

/**
 * Os quatro passos que destravam o valor do produto.
 *
 * Não é uma lista de "coisas legais de configurar": cada item aqui corresponde
 * a um problema real observado na base de teste em 2026-08-02. Barbearia sem
 * WhatsApp conectado tem **zero** valor do produto; sem jornada, o agente
 * oferece horário em dia de folga; sem comissão, o Financeiro do barbeiro
 * calcula zero. Dois desses três estavam acontecendo em produção.
 *
 * A ordem importa: é a sequência em que fazem diferença.
 */
export function useAtivacao(salonId: string | null) {
  const [itens, setItens] = useState<ItemDeAtivacao[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!salonId) {
      setItens([])
      setLoading(false)
      return
    }
    setLoading(true)

    const [assinatura, conexao, servicos, profissionais] = await Promise.all([
      supabase.from('subscriptions').select('salon_id').eq('salon_id', salonId).maybeSingle(),
      supabase.from('whatsapp_connections').select('status').eq('salon_id', salonId).maybeSingle(),
      supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', salonId)
        .eq('ativo', true),
      supabase
        .from('professionals')
        .select('id, comissao_percentual, professional_schedules(id)')
        .eq('salon_id', salonId)
        .eq('ativo', true),
    ])

    const profs = (profissionais.data ?? []) as {
      id: string
      comissao_percentual: number | null
      professional_schedules: { id: string }[] | null
    }[]

    // "Feito" exige que **todo** profissional ativo esteja resolvido: um
    // barbeiro sem jornada já basta para o agente marcar em dia de folga dele.
    const todosComJornada =
      profs.length > 0 && profs.every((p) => (p.professional_schedules ?? []).length > 0)
    const todosComComissao =
      profs.length > 0 && profs.every((p) => p.comissao_percentual !== null)

    setItens([
      // Só aparece quando falta, porque não é passo de configuração: é defeito
      // de cadastro nosso. Sem a linha de assinatura a barbearia fica fora das
      // automações e ninguém percebe — foi o que a auditoria de 2026-08-05
      // encontrou numa unidade real da base. Aqui ele fica onde o dono já olha,
      // em vez de esperar que ele abra a tela de Assinatura por acaso.
      ...(assinatura.data
        ? []
        : [
            {
              id: 'assinatura' as const,
              titulo: 'Assinatura não registrada',
              porque: 'Sem isso os lembretes automáticos não são enviados. Fale com o suporte.',
              rota: '/assinatura',
              feito: false,
            },
          ]),
      {
        id: 'whatsapp',
        titulo: 'Conectar o WhatsApp',
        porque: 'Sem isso o agente não atende ninguém.',
        rota: '/conexao',
        feito: conexao.data?.status === 'open',
      },
      {
        id: 'servicos',
        titulo: 'Conferir o catálogo',
        porque: 'O agente precisa saber o que você faz, por quanto e em quanto tempo.',
        rota: '/catalogo',
        feito: (servicos.count ?? 0) > 0,
      },
      {
        id: 'jornada',
        titulo: 'Definir a jornada da equipe',
        porque: 'Sem isso o agente pode marcar em dia de folga do barbeiro.',
        rota: '/equipe',
        feito: todosComJornada,
      },
      {
        id: 'comissao',
        titulo: 'Definir a comissão',
        porque: 'Sem isso o Financeiro do barbeiro mostra zero.',
        rota: '/equipe',
        feito: todosComComissao,
      },
    ])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  const pendentes = itens.filter((i) => !i.feito)
  return { itens, pendentes, completo: !loading && pendentes.length === 0, loading, reload }
}
