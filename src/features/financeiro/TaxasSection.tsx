import { Clock, Repeat, Scissors, TrendingDown, TrendingUp } from 'lucide-react'
import { Skeleton } from '../../components/Skeleton'
import {
  direcao,
  formatHoras,
  formatMedia,
  formatPercentual,
  ocupacao,
  servicosPorAtendimento,
  taxaDeRetorno,
  type Desempenho,
} from './taxas'

/**
 * As três taxas do barbeiro (item 14, migration 0183).
 *
 * Os quatro cartões que já existiam no Financeiro são contagem ou soma:
 * dizem QUANTO aconteceu e nunca SE FOI BOM. Estes três são razões, e por isso
 * têm forma diferente — o número grande em cima e, embaixo, **as duas
 * grandezas que o produziram**.
 *
 * Mostrar o denominador é o ponto, não enfeite. "Ocupação: 0,9%" sozinho não
 * diz se a cadeira está vazia ou se a jornada está cadastrada errada; já
 * "0,9% — 7h40 de 828h de jornada" deixa quem conhece a barbearia julgar. E há
 * barbearia que abre domingo: o sistema não tem como saber se sete dias por
 * semana é engano ou é o negócio da pessoa, então ele afirma os fatos que usou
 * e não adivinha (decisão do dono, 30/09).
 */

function Seta({ atual, anterior }: { atual: number | null; anterior: number | null }) {
  const d = direcao(atual, anterior)
  if (d === null || anterior === null) return null

  // "Igual" ainda merece a linha: saber que não mexeu é informação. Só não
  // merece a seta, que afirmaria um movimento que não houve.
  if (d === 'igual') {
    return <span className="text-xs text-muted-foreground">igual ao período anterior</span>
  }

  const Icone = d === 'subiu' ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        d === 'subiu' ? 'text-success' : 'text-danger'
      }`}
    >
      <Icone size={14} />
      antes {formatPercentual(anterior)}
    </span>
  )
}

function Taxa({
  icone,
  rotulo,
  valor,
  base,
  comparacao,
}: {
  icone: React.ReactNode
  rotulo: string
  /** Já formatado, ou `null` quando não há denominador. */
  valor: string | null
  /** As duas grandezas por trás, ou a explicação de por que não há conta. */
  base: string
  comparacao?: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-primary-soft text-primary-soft-foreground">
            {icone}
          </span>
          <span className="text-sm truncate">{rotulo}</span>
        </div>
        {valor !== null && comparacao}
      </div>
      <div className={`num-destaque text-2xl ${valor === null ? 'text-muted-foreground' : 'text-foreground'}`}>
        {valor ?? '—'}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{base}</p>
    </div>
  )
}

export function TaxasSection({
  atual,
  anterior,
  loading,
}: {
  atual: Desempenho
  anterior: Desempenho | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl shadow-sm p-4 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    )
  }

  const ocup = ocupacao(atual)
  const retorno = taxaDeRetorno(atual)
  const porAtendimento = servicosPorAtendimento(atual)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Taxa
        icone={<Clock size={15} />}
        rotulo="Ocupação da cadeira"
        valor={ocup === null ? null : formatPercentual(ocup)}
        base={
          ocup === null
            ? // Ausência de cadastro NÃO é zero por cento. Dizer "0%" acusaria
              // o barbeiro de uma preguiça que é um campo em branco em Equipe.
              'Sem jornada cadastrada — defina os horários em Equipe para esta conta existir.'
            : `${formatHoras(atual.minutosOcupados)} atendendo de ${formatHoras(atual.minutosJornada)} de jornada`
        }
        comparacao={<Seta atual={ocup} anterior={anterior ? ocupacao(anterior) : null} />}
      />

      <Taxa
        icone={<Repeat size={15} />}
        rotulo="Clientes que voltam"
        valor={retorno === null ? null : formatPercentual(retorno)}
        base={
          retorno === null
            ? 'Nenhum atendimento concluído no período.'
            : `${atual.clientesQueVoltaram} de ${atual.clientes} cliente${atual.clientes === 1 ? '' : 's'} tem outro horário`
        }
        comparacao={<Seta atual={retorno} anterior={anterior ? taxaDeRetorno(anterior) : null} />}
      />

      <Taxa
        icone={<Scissors size={15} />}
        rotulo="Serviços por atendimento"
        valor={porAtendimento === null ? null : formatMedia(porAtendimento)}
        base={
          porAtendimento === null
            ? 'Nenhum atendimento concluído no período.'
            : `${atual.servicos} serviço${atual.servicos === 1 ? '' : 's'} em ${atual.atendimentos} atendimento${atual.atendimentos === 1 ? '' : 's'}`
        }
        // Esta não é percentual, então a régua da `Seta` (que escreve "antes
        // 12,0%") não serve. O valor anterior vai por extenso, sem seta.
        comparacao={
          anterior && servicosPorAtendimento(anterior) !== null ? (
            <span className="text-xs text-muted-foreground">
              antes {formatMedia(servicosPorAtendimento(anterior) as number)}
            </span>
          ) : null
        }
      />
    </div>
  )
}
