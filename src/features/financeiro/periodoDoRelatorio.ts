/**
 * O período do relatório exportado (achado 39 da revisão de 01/09).
 *
 * O modal partia sempre de `new Date()`: o dono navegava para agosto, clicava
 * em Exportar e baixava setembro — com o arquivo chamado pelo dia de hoje,
 * nada denunciava a troca, e ele mandava aquilo para o contador. Agora o mês
 * é o que está na tela, e o intervalo tem fim: [início, fim), meio-aberto,
 * para o último dia do mês não vazar para o seguinte.
 */
export type PeriodoDoRelatorio = 'dia' | 'semana' | 'mes'

export type Intervalo = {
  inicio: Date
  /** Exclusivo: consultar com `< fim`. */
  fim: Date
  /** "hoje", "nesta semana", "em agosto de 2026" — para a frase de vazio. */
  rotulo: string
  /** Vai no nome do arquivo: `financeiro-<sufixo>.csv`. */
  sufixo: string
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function chaveDoDia(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

export function intervaloDoRelatorio(
  periodo: PeriodoDoRelatorio,
  refMonth: string,
  agora: Date = new Date(),
): Intervalo {
  if (periodo === 'dia') {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 1)
    return { inicio, fim, rotulo: 'hoje', sufixo: `dia-${chaveDoDia(inicio)}` }
  }

  if (periodo === 'semana') {
    // Semana começando na segunda-feira.
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7))
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 7)
    return { inicio, fim, rotulo: 'nesta semana', sufixo: `semana-${chaveDoDia(inicio)}` }
  }

  const [ano, mes] = refMonth.split('-').map(Number)
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 1)
  return { inicio, fim, rotulo: `em ${MESES[mes - 1]} de ${ano}`, sufixo: refMonth }
}
