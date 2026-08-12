/**
 * Deriva a jornada do barbeiro do horário de funcionamento da unidade.
 *
 * O contrato do n8n diz que barbeiro **sem** linha em `professional_schedules`
 * cai no horário do salão — então a ausência não quebrava nada enquanto a
 * barbearia tivesse um profissional só. Mas o dono abria a aba Equipe e via a
 * jornada em branco, sem saber que existia um padrão implícito; e ao contratar
 * o segundo barbeiro, os dois herdavam o mesmo horário sem que ninguém tivesse
 * escolhido isso. A auditoria também acusa a falta como "barbearia configurada
 * pela metade".
 *
 * Gravar explicitamente torna o padrão visível e editável desde o primeiro dia.
 * Em troca, mudar o horário do salão depois **não** arrasta a jornada de quem
 * já existe — o que é o comportamento certo assim que houver mais de um
 * barbeiro, já que aí eles divergem de propósito.
 *
 * Mora aqui, e não dentro de uma função, porque dois caminhos criam
 * profissional: o cadastro presencial (`admin-create-salon`) e o aceite de
 * convite (`accept-invite`). Duas cópias divergiriam, e a diferença só
 * apareceria como barbeiro sem horário semanas depois.
 */

const DIA_DA_SEMANA: Record<string, number> = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
}

export type LinhaDeJornada = {
  professional_id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

export function jornadaDoHorario(horario: unknown, professionalId: string): LinhaDeJornada[] {
  const json = (horario ?? null) as Record<string, { abre?: string; fecha?: string } | null> | null
  if (!json) return []

  return Object.entries(json).flatMap(([chave, faixa]) => {
    const dia = DIA_DA_SEMANA[chave]
    if (dia === undefined || !faixa?.abre || !faixa?.fecha) return []
    return [
      {
        professional_id: professionalId,
        dia_semana: dia,
        hora_inicio: faixa.abre,
        hora_fim: faixa.fecha,
        ativo: true,
      },
    ]
  })
}
