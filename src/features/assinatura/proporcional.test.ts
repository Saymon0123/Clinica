import { describe, it, expect } from 'vitest'
import { calcularProporcional } from '../../../supabase/functions/asaas/proporcional'

// A conta decide quanto o dono paga de verdade. Errar aqui não aparece em log
// nenhum: cobra a mais e vira reclamação, cobra a menos e vira prejuízo
// silencioso. O módulo vive junto da edge function, mas é TypeScript puro,
// então o vitest o importa direto — uma cópia no front-end divergiria.

const BASICO = 197
const PRO = 299

describe('calcularProporcional', () => {
  it('cobra a diferença cheia quando o ciclo inteiro está pela frente', () => {
    // Ciclo de 31 dias (05/08 a 05/09), trocando no primeiro dia.
    const r = calcularProporcional('2026-09-05', BASICO, PRO, new Date('2026-08-05T12:00:00Z'))
    expect(r.diasRestantes).toBe(31)
    expect(r.diasDoCiclo).toBe(31)
    expect(r.valor).toBe(102)
  })

  it('cobra metade quando falta metade do ciclo', () => {
    const r = calcularProporcional('2026-09-05', BASICO, PRO, new Date('2026-08-21T12:00:00Z'))
    expect(r.diasRestantes).toBe(15)
    expect(r.valor).toBeCloseTo((102 * 15) / 31, 2)
  })

  it('respeita o tamanho real do mês, não 30 dias fixos', () => {
    // Fevereiro tem 28: o mesmo "falta tudo" custa a diferença cheia aqui e
    // ali, mas o valor por dia muda. Fixar 30 cobraria errado nos dois.
    const fev = calcularProporcional('2026-03-01', BASICO, PRO, new Date('2026-02-15T12:00:00Z'))
    expect(fev.diasDoCiclo).toBe(28)
    expect(fev.diasRestantes).toBe(14)
    expect(fev.valor).toBe(51)
  })

  it('dispensa a cobrança quando sobra menos que o mínimo do Asaas', () => {
    // Falta 1 dia: a diferença dá ~R$ 3,29, abaixo do mínimo de R$ 5. Cobrar o
    // mínimo seria cobrar mais do que se deve.
    const r = calcularProporcional('2026-09-05', BASICO, PRO, new Date('2026-09-04T12:00:00Z'))
    expect(r.dispensado).toBe(true)
    expect(r.valor).toBe(0)
  })

  it('não cobra nada para descer de plano', () => {
    const r = calcularProporcional('2026-09-05', PRO, BASICO, new Date('2026-08-10T12:00:00Z'))
    expect(r.diferencaMensal).toBe(-102)
    expect(r.valor).toBe(0)
    expect(r.dispensado).toBe(true)
  })

  it('não cobra nada quando o período já venceu', () => {
    // Sem isto, dias negativos virariam crédito e a conta devolveria valor
    // negativo — o Asaas recusaria, mas só depois de a tela prometer.
    const r = calcularProporcional('2026-08-01', BASICO, PRO, new Date('2026-08-20T12:00:00Z'))
    expect(r.diasRestantes).toBe(0)
    expect(r.valor).toBe(0)
    expect(r.dispensado).toBe(true)
  })

  it('trata barbearia sem data de vencimento', () => {
    const r = calcularProporcional(null, BASICO, PRO, new Date('2026-08-20T12:00:00Z'))
    expect(r.valor).toBe(0)
    expect(r.dispensado).toBe(true)
  })
})
