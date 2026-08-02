import { useState } from 'react'
import { Megaphone, Clock, ChevronRight, Info } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useMarketingData } from './useMarketingData'
import { SimuladorModal } from './SimuladorModal'
import { SEGMENTOS, DIAS_SEMANA, type HorarioOcioso, type ResumoSegmento } from './types'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function CardSegmento({
  resumo,
  onAbrir,
}: {
  resumo: ResumoSegmento
  onAbrir: () => void
}) {
  const info = SEGMENTOS.find((s) => s.id === resumo.segmento)
  if (!info) return null

  const vazio = resumo.clientes === 0

  return (
    <button
      onClick={onAbrir}
      disabled={vazio}
      className={`text-left bg-surface border border-border rounded-xl p-4 transition-all duration-300 ${
        vazio
          ? 'opacity-60 cursor-default'
          : 'hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="font-semibold text-foreground">{info.titulo}</h2>
          <p className="text-xs text-muted-foreground">{info.regra}</p>
        </div>
        {!vazio && <ChevronRight size={18} className="text-muted-foreground shrink-0 mt-0.5" />}
      </div>

      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-2xl font-semibold text-foreground tabular-nums">{resumo.clientes}</span>
        <span className="text-sm text-muted-foreground">
          {resumo.clientes === 1 ? 'cliente elegível' : 'clientes elegíveis'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <dt className="text-muted-foreground">Ticket médio</dt>
          <dd className="text-foreground font-medium tabular-nums">{moeda(resumo.ticketMedio)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Potencial</dt>
          <dd className="text-foreground font-medium tabular-nums">{moeda(resumo.potencial)}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground leading-relaxed">{info.porque}</p>

      {vazio && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
          Ninguém elegível agora.
        </p>
      )}
    </button>
  )
}

export function MarketingPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const { segmentos, ociosos, comissaoMedia, loading, error } = useMarketingData(salonId)
  const [aberto, setAberto] = useState<ResumoSegmento | null>(null)

  if (salonLoading || loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha uma barbearia para ver as oportunidades de campanha.
      </p>
    )
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  // Mantém a ordem declarada em SEGMENTOS: o banco devolve na ordem do array
  // interno, mas a tela não deve depender disso.
  const ordenados = SEGMENTOS.map((s) => segmentos.find((r) => r.segmento === s.id)).filter(
    (r): r is ResumoSegmento => !!r,
  )

  // Uma linha por dia da semana, não as N piores faixas: ordenar só por
  // ocupação empilha cinco horários da mesma segunda-feira, e o dono fica sem
  // saber quais DIAS estão vazios — que é a pergunta que ele faz.
  const ociososPorDia = Object.values(
    ociosos.reduce<Record<number, { pior: HorarioOcioso; vazias: number }>>((acc, o) => {
      const atual = acc[o.diaSemana]
      const vazia = o.ocupacao < 0.25 ? 1 : 0
      if (!atual) return { ...acc, [o.diaSemana]: { pior: o, vazias: vazia } }
      return {
        ...acc,
        [o.diaSemana]: {
          pior: o.ocupacao < atual.pior.ocupacao ? o : atual.pior,
          vazias: atual.vazias + vazia,
        },
      }
    }, {}),
  )
    .sort((a, b) => a.pior.ocupacao - b.pior.ocupacao)
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary-soft-foreground shrink-0">
          <Megaphone size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            Onde vale a pena dar desconto — e quanto ele custa de verdade
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ordenados.map((r) => (
          <CardSegmento key={r.segmento} resumo={r} onAbrir={() => setAberto(r)} />
        ))}
      </div>

      {ociososPorDia.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Faixas mais vazias da agenda</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Medido nas últimas 4 semanas. Desconto que preenche esses horários não tira venda dos
            horários cheios.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ociososPorDia.map(({ pior, vazias }) => (
              <div key={pior.diaSemana} className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="text-sm font-medium text-foreground">{DIAS_SEMANA[pior.diaSemana]}</p>
                <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                  Mais vazio às {String(pior.hora).padStart(2, '0')}h ·{' '}
                  {(pior.ocupacao * 100).toFixed(0)}%
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {vazias} {vazias === 1 ? 'faixa quase vazia' : 'faixas quase vazias'} ·{' '}
                  {pior.capacidade} {pior.capacidade === 1 ? 'barbeiro' : 'barbeiros'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 text-xs text-muted-foreground bg-surface-2 border border-border rounded-lg p-3">
        <Info size={14} className="shrink-0 mt-0.5" />
        <p>
          Já ficam de fora de todo segmento: quem tem horário marcado, quem nunca conversou pelo
          WhatsApp do salão, quem pediu para não receber e quem recebeu campanha nos últimos 30
          dias. O envio de campanha entra na próxima fase — por enquanto a tela serve para decidir.
        </p>
      </div>

      {aberto && (
        <SimuladorModal
          salonId={salonId}
          resumo={aberto}
          comissaoMedia={comissaoMedia}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  )
}
