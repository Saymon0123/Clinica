import { useCallback, useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * A faixa que diz que chegou o dia de pagar a comissão.
 *
 * O modal de fechamento já existia e funcionava — faltava **alguém avisar que
 * chegou a hora**. Até aqui o ciclo dependia de o dono lembrar sozinho, e
 * barbeiro cobrando comissão atrasada é a conversa mais azeda que existe numa
 * barbearia.
 *
 * Mostra **quanto e para quem**, não um ponto vermelho: aviso que não diz o
 * número obriga a abrir o modal só para descobrir se é urgente.
 *
 * Só aparece quando a barbearia definiu `dia_fechamento_comissao` (a view
 * `comissoes_a_pagar` já filtra isso) e quando há valor vencido. E conta apenas
 * trabalho feito **até o fechamento vigente** — o que entrou depois é do
 * próximo, e somar aqui faria o dono pagar adiantado.
 *
 * Só para gestor. O barbeiro já vê a comissão dele nos cartões; dizer a ele
 * "você tem R$ X para receber" numa faixa de alerta é decisão de negócio do
 * dono, não efeito colateral desta tela.
 */

type Linha = {
  profissional: string
  valor: number | string
  fecha_em: string
  dia_de_fechamento: number
}

function moeda(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** '2026-09-05' → '05/09'. Por partes: `new Date('YYYY-MM-DD')` é UTC e volta
 *  um dia no Brasil. */
function diaMes(iso: string) {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function AvisoDeComissao({
  salonId,
  aoAbrirFechamento,
}: {
  salonId: string
  aoAbrirFechamento: () => void
}) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('comissoes_a_pagar')
      .select('profissional, valor, fecha_em, dia_de_fechamento')
      .eq('salon_id', salonId)
      .order('valor', { ascending: false })
    if (error) {
      // Faixa de apoio: erro aqui deixa a tela MUDA em vez de poluir o
      // Financeiro com um aviso que fala de si mesmo (achado 31).
      console.error('Erro ao buscar a comissão a pagar:', error)
      setLinhas([])
    } else {
      setLinhas((data ?? []) as Linha[])
    }
    setCarregando(false)
  }, [salonId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando || linhas.length === 0) return null

  const total = linhas.reduce((s, l) => s + Number(l.valor), 0)
  const fechaEm = linhas[0].fecha_em

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-warning-soft border border-warning/40 p-4 mb-5">
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-warning/20 text-warning shrink-0">
        <CalendarClock size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Comissão fechada em {diaMes(fechaEm)}: {moeda(total)} a pagar
        </p>
        {/* Nome e valor de cada um, porque "R$ 4.798,75" sozinho não diz a quem
            o dono deve nem quanto a cada. */}
        <p className="text-xs text-muted-foreground mt-0.5">
          {linhas.map((l) => `${l.profissional} ${moeda(Number(l.valor))}`).join(' · ')}
        </p>
      </div>
      <button
        onClick={aoAbrirFechamento}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-medium shrink-0"
      >
        Fechar comissão
      </button>
    </div>
  )
}
