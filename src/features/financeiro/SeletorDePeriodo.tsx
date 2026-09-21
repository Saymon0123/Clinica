import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PeriodFilter } from './useFinanceiroData'

/**
 * O seletor de período do Financeiro — Dia | Mês, cada lado com navegação.
 *
 * Extraído da página em 21/09, quando o lado "Dia" deixou de ser sempre hoje
 * e ganhou chevrons + calendário (o dono desce a qualquer dia para achar os
 * de mais movimento). O seletor é dialeto feito à mão por natureza (a régua
 * D5 reconhece), então ele mora num arquivo só, com teto próprio na catraca
 * de botões — e a página desce o dela.
 */

const MESES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function labelDoMes(refMonth: string) {
  const [ano, mes] = refMonth.split('-').map(Number)
  return `${MESES_LABEL[mes - 1]} ${ano}`
}

export function somaMes(refMonth: string, delta: number) {
  const [ano, mes] = refMonth.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Hoje no relógio do aparelho, 'YYYY-MM-DD' — o mesmo relógio do resto da página. */
export function hojeISO() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function somaDia(refDia: string, delta: number) {
  const [ano, mes, dia] = refDia.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "sáb, 20/09" — o dia com o dia da semana, que é o que responde
 *  "qual dia tem mais movimento". */
export function labelDoDia(refDia: string) {
  const [ano, mes, dia] = refDia.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]
  return `${semana}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

export function SeletorDePeriodo({
  filter,
  refMonth,
  refDia,
  aoAtivarDia,
  aoEscolherDia,
  aoAtivarMes,
}: {
  filter: PeriodFilter
  refMonth: string
  refDia: string
  /** delta em dias; 0 só ativa o lado Dia. */
  aoAtivarDia: (delta: number) => void
  /** data 'YYYY-MM-DD' vinda do calendário. */
  aoEscolherDia: (iso: string) => void
  /** delta em meses; 0 só ativa o lado Mês. */
  aoAtivarMes: (delta: number) => void
}) {
  const ehHoje = refDia === hojeISO()
  const ehMesCorrente = refMonth === hojeISO().slice(0, 7)

  return (
    <div className="inline-flex items-center rounded-lg bg-surface-2 border border-border p-1 text-sm">
      <div
        className={`inline-flex items-center rounded-md transition-colors ${
          filter === 'dia' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
        }`}
      >
        <button
          onClick={() => aoAtivarDia(-1)}
          aria-label="Dia anterior"
          className="px-1.5 py-1.5 hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => aoAtivarDia(0)} className="px-1 py-1.5 font-medium min-w-24 text-center">
          {ehHoje ? 'Hoje' : labelDoDia(refDia)}
        </button>
        {/* O calendário: um alvo pequeno colado no rótulo. O input fica
            transparente de propósito — o navegador cuida do popover nativo. */}
        <input
          type="date"
          value={refDia}
          max={hojeISO()}
          onChange={(e) => e.target.value && aoEscolherDia(e.target.value)}
          aria-label="Escolher o dia"
          className="w-7 bg-transparent text-transparent cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        <button
          onClick={() => aoAtivarDia(1)}
          disabled={filter === 'dia' && ehHoje}
          aria-label="Próximo dia"
          className="px-1.5 py-1.5 hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div
        className={`inline-flex items-center rounded-md transition-colors ${
          filter === 'mes' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground'
        }`}
      >
        <button
          onClick={() => aoAtivarMes(-1)}
          aria-label="Mês anterior"
          className="px-1.5 py-1.5 hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => aoAtivarMes(0)} className="px-1 py-1.5 font-medium min-w-20 text-center">
          {ehMesCorrente ? 'Este mês' : labelDoMes(refMonth)}
        </button>
        <button
          onClick={() => aoAtivarMes(1)}
          disabled={ehMesCorrente}
          aria-label="Próximo mês"
          className="px-1.5 py-1.5 hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
