/**
 * A frase da agenda pública sem horário (M8 do giro de 10/09).
 *
 * A edge `agenda-publica` diz o motivo (`_shared/semHorario.ts`); aqui mora só
 * o texto. Antes era uma frase para quatro situações — "tente outro serviço
 * acima" — dita também para quem abria o link às 23h, no dia de folga, e para
 * a barbearia sem serviço nenhum, em que o seletor nem tinha opção.
 */
export type MotivoSemHorario = 'sem_servicos' | 'fechado_hoje' | 'expediente_acabou' | 'lotado'

export function mensagemSemHorario({
  motivo,
  temServicoMaisCurto,
  temWhatsapp,
}: {
  motivo: MotivoSemHorario
  /** Trocar de serviço só ajuda quando existe um mais curto que o escolhido. */
  temServicoMaisCurto: boolean
  /** Sem número cadastrado não há botão — a frase não pode prometer um. */
  temWhatsapp: boolean
}): string {
  const contato = temWhatsapp ? 'chame a barbearia no WhatsApp' : 'fale com a barbearia'
  switch (motivo) {
    case 'sem_servicos':
      return `Esta barbearia ainda não tem serviços para marcar por aqui. Para agendar, ${contato}.`
    case 'fechado_hoje':
      return `A barbearia não atende hoje. Pelo QR só dá para marcar no mesmo dia — para outro dia, ${contato}.`
    case 'expediente_acabou':
      return `O expediente de hoje já acabou. Pelo QR só dá para marcar no mesmo dia — para outro dia, ${contato}.`
    default:
      return (
        'Não sobrou horário hoje para esse serviço.' +
        (temServicoMaisCurto ? ' Um serviço mais curto ainda pode caber — troque acima.' : '') +
        ` Para outro dia, ${contato}.`
      )
  }
}
