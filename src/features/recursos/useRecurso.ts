import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'

/**
 * Um recurso está ligado para esta barbearia?
 *
 * A regra mora no banco (`recursos_ativos`, migration `0059`), não aqui. A tela
 * pergunta; ela não decide. Foi a mesma escolha do gating de plano: um `if` no
 * front precisa ser repetido em cada lugar novo, e esquecer é silencioso —
 * ninguém percebe que uma barbearia viu o que ainda não deveria.
 *
 * **Enquanto carrega, `ativo` é `false`.** Um recurso que pisca na tela e some é
 * pior que um que demora: o dono clica no que estava aparecendo e a ação falha.
 * Esconder até ter certeza é o comportamento seguro.
 *
 * `carregando` existe desde 04/09/2026, quando o bloco do QR passou a mostrar
 * também o estado DESLIGADO, com um convite para ativar. Aí "false" deixou de
 * significar uma coisa só: sem distinguir, a tela piscava "ative o QR" por um
 * instante em toda barbearia que já o tinha ligado.
 *
 * `definir` grava e atualiza na hora, sem esperar uma nova consulta — a escrita
 * passa pela RPC `definir_agenda_publica` (0138), que é a única porta: as
 * tabelas de recurso não aceitam escrita de `authenticated`.
 *
 * Uso:
 *
 * ```tsx
 * const { ativo, carregando } = useRecurso('agenda_nova')
 * if (carregando) return <Skeleton />
 * if (!ativo) return <AgendaAtual />
 * ```
 */
export function useRecurso(chave: string): {
  ativo: boolean
  carregando: boolean
  definir: (valor: boolean) => void
} {
  const { salonId } = useSalon()
  const [ativo, setAtivo] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      if (!salonId) {
        setAtivo(false)
        setCarregando(false)
        return
      }
      setCarregando(true)
      const { data, error } = await supabase
        .from('recursos_ativos')
        .select('ativo')
        .eq('salon_id', salonId)
        .eq('recurso', chave)
        .maybeSingle()

      if (cancelado) return
      if (error) {
        // Falha de rede não pode ligar funcionalidade. Registra e mantém
        // desligado — o pior caso é o dono não ver algo novo, não é ele usar
        // uma tela que ainda não deveria existir para ele.
        console.error('Erro ao consultar recurso:', chave, error)
        setAtivo(false)
        setCarregando(false)
        return
      }
      setAtivo(data?.ativo === true)
      setCarregando(false)
    }

    carregar()
    // Sem cancelar, uma resposta lenta de uma barbearia anterior chegaria
    // depois da troca de unidade e ligaria o recurso na errada.
    return () => {
      cancelado = true
    }
  }, [salonId, chave])

  return { ativo, carregando, definir: setAtivo }
}
