import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type MinhaFicha = {
  id: string
  nome: string
  comissao_percentual: number | null
  /** `null` = ninguém escolheu os serviços dele; a lista é o padrão do convite. */
  servicos_confirmados_em: string | null
  /** `null` = ninguém olhou a jornada; ela foi derivada do horário da barbearia. */
  jornada_confirmada_em: string | null
}

/**
 * A ficha de profissional do próprio usuário logado, quando existe.
 *
 * O barbeiro é duas coisas no banco: uma linha em `user_salons` (o acesso) e uma
 * em `professionals` (a cadeira). Quem tem acesso pode não ter cadeira -- um
 * gerente que só administra --, e é por isso que `ficha` pode voltar `null` sem
 * que nada esteja errado.
 *
 * `erro` é separado de "não tem": cartão de primeira entrada que aparece porque
 * a rede caiu é pior do que cartão que não aparece. Na dúvida, não mostra nada.
 */
export function useMinhaFicha(salonId: string | null) {
  const [ficha, setFicha] = useState<MinhaFicha | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  const reload = useCallback(async () => {
    if (!salonId) {
      setFicha(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(false)

    const { data: sessao } = await supabase.auth.getUser()
    const uid = sessao.user?.id
    if (!uid) {
      setFicha(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('professionals')
      .select('id, nome, comissao_percentual, servicos_confirmados_em, jornada_confirmada_em')
      .eq('salon_id', salonId)
      .eq('user_id', uid)
      .eq('ativo', true)
      .maybeSingle()

    if (error) {
      console.error('Erro ao carregar a própria ficha:', error)
      setErro(true)
      setFicha(null)
    } else {
      setFicha(
        data
          ? {
              id: data.id,
              nome: data.nome,
              comissao_percentual:
                data.comissao_percentual == null ? null : Number(data.comissao_percentual),
              servicos_confirmados_em: data.servicos_confirmados_em,
              jornada_confirmada_em: data.jornada_confirmada_em,
            }
          : null,
      )
    }
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    reload()
  }, [reload])

  return { ficha, loading, erro, reload }
}
