/**
 * A frase da agenda pública sem horário (M8 do giro de 10/09).
 *
 * A edge `agenda-publica` diz o motivo (`_shared/semHorario.ts`); aqui mora só
 * o texto. Antes era uma frase para quatro situações — "tente outro serviço
 * acima" — dita também para quem abria o link às 23h, no dia de folga, e para
 * a barbearia sem serviço nenhum, em que o seletor nem tinha opção.
 *
 * ─── Etapa 2, catorze dias (13/09/2026) ─────────────────────────────────────
 *
 * Três das quatro frases terminavam em "Pelo QR só dá para marcar no mesmo dia
 * — para outro dia, chame a barbearia no WhatsApp". Isso deixou de ser verdade
 * no dia em que a janela abriu para catorze dias, e uma frase que manda a
 * pessoa sair do sistema quando o sistema resolve é pior que frase nenhuma:
 * ela desiste de um caminho que existe, e a barbearia recebe no WhatsApp um
 * pedido que a agenda atenderia sozinha.
 *
 * Agora a frase diz o que aconteceu NAQUELE dia e para onde ir. Quando há outro
 * dia com vaga, ela nem menciona o WhatsApp: quem fala é o botão "ver
 * quinta-feira", que leva direto. O WhatsApp volta a aparecer só quando a
 * janela inteira está sem nada — aí ele é a única saída de verdade.
 */
export type MotivoSemHorario = 'sem_servicos' | 'fechado_hoje' | 'expediente_acabou' | 'lotado'

export function mensagemSemHorario({
  motivo,
  comoEncurtar,
  temWhatsapp,
  ehHoje,
  temOutroDia,
  diasNaJanela,
}: {
  motivo: MotivoSemHorario
  /**
   * O que a pessoa pode fazer para o atendimento caber, ou null quando não há
   * nada a fazer. `'tirar'` entrou com a seleção múltipla (13/09): com
   * corte+barba escolhidos, mandar "troque por um mais curto" é conselho para
   * outra tela — o que resolve é desmarcar um dos dois. `'trocar'` só quando há
   * UM escolhido e existe outro mais curto no catálogo.
   */
  comoEncurtar: 'trocar' | 'tirar' | null
  /** Sem número cadastrado não há botão — a frase não pode prometer um. */
  temWhatsapp: boolean
  /**
   * O dia olhado é o de hoje? `fechado_hoje` mantém esse nome no fio por
   * compatibilidade de implantação (ver `_shared/semHorario.ts`), mas o dia
   * pode ser qualquer um dos catorze — e "hoje" numa terça da semana que vem
   * seria mentira.
   */
  ehHoje: boolean
  /** Algum outro dia da janela tem vaga? Se tem, o botão fala; a frase cala. */
  temOutroDia: boolean
  /** Quantos dias a janela cobre. Vem do tamanho da faixa, não de uma cópia da
   *  constante da edge — assim os dois nunca divergem. */
  diasNaJanela: number
}): string {
  const contato = temWhatsapp ? 'chame a barbearia no WhatsApp' : 'fale com a barbearia'

  if (motivo === 'sem_servicos') {
    return `Esta barbearia ainda não tem serviços para marcar por aqui. Para agendar, ${contato}.`
  }

  const abertura =
    motivo === 'fechado_hoje'
      ? ehHoje
        ? 'A barbearia não atende hoje.'
        : 'A barbearia não atende neste dia.'
      : motivo === 'expediente_acabou'
        ? 'O expediente de hoje já acabou.'
        : (ehHoje ? 'Não sobrou horário hoje' : 'Não sobrou horário neste dia') +
          (comoEncurtar === 'tirar' ? ' para esses serviços juntos.' : ' para esse serviço.') +
          // Só faz sentido em dia cheio: às 23h, ou num dia de folga, mexer nos
          // serviços não muda nada.
          (comoEncurtar === 'trocar'
            ? ' Um serviço mais curto ainda pode caber — troque acima.'
            : comoEncurtar === 'tirar'
              ? ' Separados eles ainda podem caber — desmarque um acima.'
              : '')

  // Com outro dia disponível a frase para aqui, de propósito: logo abaixo dela
  // há um botão que leva para aquele dia, e repetir "veja outro dia" em texto
  // só empurra o botão para baixo na tela de quem está com pressa.
  if (temOutroDia) return abertura
  return `${abertura} Nos próximos ${diasNaJanela} dias não sobrou nada — ${contato}.`
}
